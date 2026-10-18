import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import {
  affiliateClicks,
  chatMessages,
  chatSessions,
  checkIns,
  groupMembers,
  groups,
  itemVotes,
  itineraries,
  itineraryBookings,
  itineraryItems,
  itineraryNights,
  itineraryProposals,
  notifications,
  orders,
  pointsLedger,
  preferenceWeights,
  profiles,
  reviews,
  userBadges,
  userConstraints,
} from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { listConsents, type ConsentRecord } from "./consents";
import { EXPORT_DAILY_LIMIT, EXPORT_WINDOW_SECONDS } from "./config";
import { userQuotaAllowed } from "./quota";

// Esportazione dei propri dati (passo 8.2, diritto di accesso e portabilità). Tutto si legge con
// dbAsUser: la RLS dà solo le righe dell'utente, e ogni query filtra anche per user_id. Gli altri
// membri dei gruppi compaiono solo come gruppo di cui si è membri, mai con i loro dati.
// Esclusi: il profilo vettoriale (embedding, un valore numerico derivato) e l'hash dei link di
// condivisione. Gli eventi di profilazione passano da export_profiling (user_events non è leggibile
// dai ruoli applicativi).

export type PointsRow = {
  createdAt: Date;
  reason: string;
  delta: number;
  season: string;
};

export type AccountExport = {
  exportedAt: string;
  format: "isula-account-export";
  version: 1;
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    locale: string;
    homeAirportIata: string | null;
    pace: string | null;
    party: string | null;
    onboardingCompletedAt: Date | null;
    leaderboardOptOut: boolean;
    createdAt: Date;
  } | null;
  consents: ConsentRecord[];
  preferences: {
    constraints: Record<string, unknown> | null;
    weights: { interestKey: string; explicit: number; implicit: number }[];
  };
  profilingEvents: unknown;
  trips: {
    itineraries: Record<string, unknown>[];
    items: Record<string, unknown>[];
    nights: Record<string, unknown>[];
    bookings: Record<string, unknown>[];
  };
  groups: { groupId: string; groupName: string; role: string; joinedAt: Date }[];
  votes: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  checkIns: Record<string, unknown>[];
  points: PointsRow[];
  badges: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  chats: { session: Record<string, unknown>; messages: Record<string, unknown>[] }[];
  affiliateClicks: Record<string, unknown>[];
  orders: Record<string, unknown>[];
};

async function collect(tx: UserTx, user: DbUser) {
  const [profile] = await tx
    .select({
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      locale: profiles.locale,
      homeAirportIata: profiles.homeAirportIata,
      pace: profiles.pace,
      party: profiles.party,
      onboardingCompletedAt: profiles.onboardingCompletedAt,
      leaderboardOptOut: profiles.leaderboardOptOut,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  const [constraints] = await tx
    .select()
    .from(userConstraints)
    .where(eq(userConstraints.userId, user.id));

  const weights = await tx
    .select({
      interestKey: preferenceWeights.interestKey,
      explicit: preferenceWeights.explicit,
      implicit: preferenceWeights.implicit,
    })
    .from(preferenceWeights)
    .where(eq(preferenceWeights.userId, user.id));

  const [events] = await tx.execute<{ events: unknown }>(sql`select public.export_profiling() as events`);

  const ownTrips = await tx.select().from(itineraries).where(eq(itineraries.ownerId, user.id));
  const tripIds = ownTrips.map((trip) => trip.id);
  const items = tripIds.length === 0 ? [] : await tx.select().from(itineraryItems).where(inArray(itineraryItems.itineraryId, tripIds));
  const nights = tripIds.length === 0 ? [] : await tx.select().from(itineraryNights).where(inArray(itineraryNights.itineraryId, tripIds));
  const bookings = tripIds.length === 0 ? [] : await tx.select().from(itineraryBookings).where(inArray(itineraryBookings.itineraryId, tripIds));

  const memberships = await tx
    .select({
      groupId: groupMembers.groupId,
      groupName: groups.name,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id));

  const votes = await tx.select().from(itemVotes).where(eq(itemVotes.userId, user.id));
  const proposals = await tx.select().from(itineraryProposals).where(eq(itineraryProposals.proposedBy, user.id));
  const ownReviews = await tx.select().from(reviews).where(eq(reviews.userId, user.id));
  const ownCheckIns = await tx.select().from(checkIns).where(eq(checkIns.userId, user.id));
  const points = await tx.select().from(pointsLedger).where(eq(pointsLedger.userId, user.id));
  const badges = await tx.select().from(userBadges).where(eq(userBadges.userId, user.id));
  const ownNotifications = await tx.select().from(notifications).where(eq(notifications.userId, user.id));

  const sessions = await tx.select().from(chatSessions).where(eq(chatSessions.userId, user.id));
  const sessionIds = sessions.map((session) => session.id);
  const messages =
    sessionIds.length === 0 ? [] : await tx.select().from(chatMessages).where(inArray(chatMessages.sessionId, sessionIds));

  const clicks = await tx.select().from(affiliateClicks).where(eq(affiliateClicks.userId, user.id));
  const ownOrders = await tx.select().from(orders).where(eq(orders.userId, user.id));

  return {
    profile: profile ?? null,
    constraints: constraints ?? null,
    weights,
    events: events?.events ?? [],
    trips: { itineraries: ownTrips, items, nights, bookings },
    memberships,
    votes,
    proposals,
    reviews: ownReviews,
    checkIns: ownCheckIns,
    points,
    badges,
    notifications: ownNotifications,
    chats: sessions.map((session) => ({
      session,
      messages: messages.filter((message) => message.sessionId === session.id),
    })),
    clicks,
    orders: ownOrders,
  };
}

// Dati dell'utente nel formato di esportazione. Una sola transazione, quindi una sola fotografia.
export async function buildAccountExport(user: DbUser): Promise<AccountExport> {
  const [data, consents] = await Promise.all([
    dbAsUser(user, (tx) => collect(tx, user)),
    listConsents(user),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: "isula-account-export",
    version: 1,
    profile: data.profile,
    consents,
    preferences: { constraints: data.constraints, weights: data.weights },
    profilingEvents: data.events,
    trips: data.trips,
    groups: data.memberships,
    votes: data.votes,
    proposals: data.proposals,
    reviews: data.reviews,
    checkIns: data.checkIns,
    points: data.points,
    badges: data.badges,
    notifications: data.notifications,
    chats: data.chats,
    affiliateClicks: data.clicks,
    orders: data.orders,
  };
}

// CSV dei punti: le sole righe del ledger (data, motivo, punti, stagione).
export function pointsCsv(points: PointsRow[]): string {
  const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [["data", "motivo", "punti", "stagione"].map(cell).join(",")];
  for (const row of points) {
    lines.push([row.createdAt.toISOString(), row.reason, row.delta, row.season].map(cell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// Quota di esportazioni (EXPORT_DAILY_LIMIT al giorno per utente), vedi quota.ts.
export async function exportAllowed(user: DbUser): Promise<boolean> {
  return userQuotaAllowed(user, "export", EXPORT_DAILY_LIMIT, EXPORT_WINDOW_SECONDS);
}
