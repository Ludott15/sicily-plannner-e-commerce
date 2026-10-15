import "server-only";
import { sql } from "drizzle-orm";
import { nearbyAlternatives, type AlternativeCandidate } from "@/lib/group-alternatives";
import { shouldSuggestAlternatives } from "@/lib/group-votes";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";

// Letture di un viaggio di gruppo (passo 4.2) con dbAsUser: la RLS decide chi vede cosa (solo i
// membri vedono voti, proposte e registro). Nessuna preferenza dei membri viene letta qui (passo 4.3).

export type VoteTally = { up: number; down: number; mine: 1 | -1 | null };

export type TripGroupAlternative = { activityId: string; title: string; placeName: string; distanceKm: number };

export type TripGroupProposal = {
  id: string;
  activityId: string;
  title: string;
  dayIndex: number;
  proposedByName: string | null;
  mine: boolean;
};

export type TripGroupChange = {
  id: string;
  kind: string;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TripGroupState = {
  members: number;
  isGroupOwner: boolean;
  // Una voce per ogni tappa del viaggio (zero voti se nessuno ha votato).
  votes: Record<string, VoteTally>;
  // Solo per le tappe con voti contrari sopra soglia (shouldSuggestAlternatives).
  alternatives: Record<string, TripGroupAlternative[]>;
  // Solo le proposte in attesa.
  proposals: TripGroupProposal[];
  // Ultime 30 voci del registro, più recenti prima.
  changes: TripGroupChange[];
};

type StopRow = {
  id: string;
  activity_id: string | null;
  title: string | null;
  place_name: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
};

type BalanceRow = { itinerary_item_id: string; up_votes: number; down_votes: number };
type MineRow = { itinerary_item_id: string; value: number };
type ProposalRow = {
  id: string;
  activity_id: string;
  title: string;
  day_index: number;
  proposed_by: string | null;
  display_name: string | null;
};
type ChangeRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
  display_name: string | null;
};

function toMine(value: number | undefined): 1 | -1 | null {
  return value === 1 ? 1 : value === -1 ? -1 : null;
}

// Catalogo delle attività attive, con area e voto, per le alternative (una query sola).
async function catalogTx(tx: UserTx): Promise<AlternativeCandidate[]> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    place_name: string;
    area: string;
    lat: number;
    lng: number;
    rating: number | null;
  }>(sql`
    select a.id, a.title, pl.name as place_name, ar.slug as area, pl.lat, pl.lng, a.rating::float8 as rating
    from public.activities a
    join public.places pl on pl.id = a.place_id
    join public.areas ar on ar.id = pl.area_id
    where a.is_active`);
  return rows.map((r) => ({
    activityId: r.id,
    title: r.title,
    placeName: r.place_name,
    area: r.area,
    lat: Number(r.lat),
    lng: Number(r.lng),
    rating: r.rating === null ? null : Number(r.rating),
  }));
}

function alternativesFor(
  stops: readonly StopRow[],
  votes: Record<string, VoteTally>,
  members: number,
  catalog: readonly AlternativeCandidate[],
): Record<string, TripGroupAlternative[]> {
  const inTrip = new Set(stops.flatMap((s) => (s.activity_id ? [s.activity_id] : [])));
  const result: Record<string, TripGroupAlternative[]> = {};
  for (const stop of stops) {
    const tally = votes[stop.id];
    if (!tally || !stop.activity_id || stop.area === null || stop.lat === null || stop.lng === null) continue;
    if (!shouldSuggestAlternatives(tally.down, members)) continue;
    result[stop.id] = nearbyAlternatives(
      { activityId: stop.activity_id, area: stop.area, lat: stop.lat, lng: stop.lng },
      catalog,
      inTrip,
    );
  }
  return result;
}

// Stato del viaggio di gruppo per chi lo vede. Lancia se il gruppo non è visibile a chi chiama.
export async function getTripGroupState(user: DbUser, itineraryId: string, groupId: string): Promise<TripGroupState> {
  return dbAsUser(user, async (tx): Promise<TripGroupState> => {
    const [group] = await tx.execute<{ owner_id: string }>(sql`
      select owner_id from public.groups where id = ${groupId}::uuid`);
    if (!group) throw new Error("group_not_visible");

    const [countRow] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from public.group_members where group_id = ${groupId}::uuid`);
    const members = Number(countRow?.n ?? 0);

    const stops = await tx.execute<StopRow>(sql`
      select ii.id, ii.activity_id, a.title, pl.name as place_name, ar.slug as area, pl.lat, pl.lng
      from public.itinerary_items ii
      left join public.activities a on a.id = ii.activity_id
      left join public.places pl on pl.id = coalesce(ii.place_id, a.place_id)
      left join public.areas ar on ar.id = pl.area_id
      where ii.itinerary_id = ${itineraryId}::uuid`);

    // Saldo dalla vista (solo voti dei membri attuali) e voto proprio.
    const balances = await tx.execute<BalanceRow>(sql`
      select b.itinerary_item_id, b.up_votes, b.down_votes
      from public.item_vote_balances b
      where b.itinerary_item_id in (
        select id from public.itinerary_items where itinerary_id = ${itineraryId}::uuid)`);
    const mine = await tx.execute<MineRow>(sql`
      select itinerary_item_id, value from public.item_votes
      where itinerary_id = ${itineraryId}::uuid and user_id = ${user.id}::uuid`);

    const votes: Record<string, VoteTally> = {};
    for (const stop of stops) votes[stop.id] = { up: 0, down: 0, mine: null };
    for (const b of balances) {
      const current = votes[b.itinerary_item_id] ?? { up: 0, down: 0, mine: null };
      votes[b.itinerary_item_id] = { ...current, up: Number(b.up_votes), down: Number(b.down_votes) };
    }
    for (const m of mine) {
      const current = votes[m.itinerary_item_id] ?? { up: 0, down: 0, mine: null };
      votes[m.itinerary_item_id] = { ...current, mine: toMine(Number(m.value)) };
    }

    const needsCatalog = stops.some((s) => {
      const tally = votes[s.id];
      return tally !== undefined && shouldSuggestAlternatives(tally.down, members);
    });
    const alternatives = needsCatalog ? alternativesFor(stops, votes, members, await catalogTx(tx)) : {};

    // group_member_profiles: nome dei compagni, filtrato dalla vista sull'appartenenza al gruppo.
    const proposalRows = await tx.execute<ProposalRow>(sql`
      select p.id, p.activity_id, a.title, p.day_index, p.proposed_by, gmp.display_name
      from public.itinerary_proposals p
      join public.activities a on a.id = p.activity_id
      left join public.group_member_profiles gmp
        on gmp.group_id = ${groupId}::uuid and gmp.user_id = p.proposed_by
      where p.itinerary_id = ${itineraryId}::uuid and p.status = 'pending'
      order by p.created_at asc, p.id asc`);

    const changeRows = await tx.execute<ChangeRow>(sql`
      select c.id, c.kind, c.payload, c.created_at, gmp.display_name
      from public.itinerary_changes c
      left join public.group_member_profiles gmp
        on gmp.group_id = ${groupId}::uuid and gmp.user_id = c.actor_id
      where c.itinerary_id = ${itineraryId}::uuid
      order by c.id desc
      limit 30`);

    return {
      members,
      isGroupOwner: group.owner_id === user.id,
      votes,
      alternatives,
      proposals: proposalRows.map((p) => ({
        id: p.id,
        activityId: p.activity_id,
        title: p.title,
        dayIndex: Number(p.day_index),
        proposedByName: p.display_name,
        mine: p.proposed_by === user.id,
      })),
      changes: changeRows.map((c) => ({
        id: String(c.id),
        kind: c.kind,
        actorName: c.display_name,
        payload: c.payload,
        createdAt: new Date(c.created_at).toISOString(),
      })),
    };
  });
}
