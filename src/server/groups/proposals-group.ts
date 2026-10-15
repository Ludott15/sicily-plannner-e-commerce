import "server-only";
import { sql } from "drizzle-orm";
import { filterReasons, groupProfileFrom, type ReasonsMode } from "@/lib/group-profile";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { driveTimesBySlug, engineCatalog } from "@/server/personalization/data";
import { proposeTrips, type Proposal, type ScoredActivity } from "@/server/personalization/engine";
import { groupPreferencesTx } from "./aggregate";

// Proposte di viaggio per il gruppo (passo 4.3): il motore con il profilo aggregato del gruppo.
// Con meno di tre membri i motivi d'interesse non si mostrano (solo logistici), e la variante
// (che dice quale interesse punta) si toglie, per non svelare i gusti di nessuno.

export const GROUP_REASONS_MIN_MEMBERS = 3;
// Giorni quando il gruppo non ha un viaggio collegato.
const DEFAULT_GROUP_DAYS = 3;

export type GroupProposals = {
  proposals: Proposal[];
  days: number;
  shortened: boolean;
  reasonsMode: ReasonsMode;
};

type TripRow = { days: number; season_months: number[] };

// Tappe e motivi in modalità logistica. Una tappa senza motivi pratici ha la riserva, che è vera
// per costruzione (scelta per punteggio nella sua area).
function logisticActivity(activity: ScoredActivity): ScoredActivity {
  const reasons = filterReasons(activity.reasons, "logistic");
  return { ...activity, reasons: reasons.length > 0 ? reasons : [{ code: "bestInZone" }] };
}

// Proposta in modalità logistica: niente variante, motivi d'area solo pratici; se non ne restano,
// il conteggio delle tappe e dei giorni (vero per costruzione).
function toGroupProposal(proposal: Proposal, mode: ReasonsMode): Proposal {
  if (mode === "group") return proposal;
  const reasons = filterReasons(proposal.reasons, "logistic");
  const stops = proposal.days.reduce((count, day) => count + day.activities.length, 0);
  return {
    ...proposal,
    variant: null,
    reasons: reasons.length > 0 ? reasons : [{ code: "stops", stops, days: proposal.days.length }],
    days: proposal.days.map((day) => ({ activities: day.activities.map(logisticActivity) })),
  };
}

// Proposte del gruppo. Errori: group_not_visible se il gruppo non è visibile a chi chiama;
// not_group_member, guest_not_allowed e 42501 dalla funzione SQL.
export async function getGroupProposals(user: DbUser, groupId: string): Promise<GroupProposals> {
  const { prefs, days, months } = await dbAsUser(user, async (tx) => {
    const [group] = await tx.execute<{ itinerary_id: string | null }>(
      sql`select itinerary_id from public.groups where id = ${groupId}::uuid`,
    );
    if (!group) throw new Error("group_not_visible");

    let trip: TripRow | undefined;
    if (group.itinerary_id !== null) {
      [trip] = await tx.execute<TripRow>(sql`
        select days, season_months::int[] as season_months
        from public.itineraries where id = ${group.itinerary_id}::uuid`);
    }
    return {
      prefs: await groupPreferencesTx(tx, groupId),
      days: trip ? Number(trip.days) : DEFAULT_GROUP_DAYS,
      months: trip?.season_months ?? [],
    };
  });

  const [catalog, driveTimes] = await Promise.all([engineCatalog(), driveTimesBySlug()]);
  const result = proposeTrips(catalog, groupProfileFrom(prefs, days, months), driveTimes);
  const reasonsMode: ReasonsMode = prefs.members < GROUP_REASONS_MIN_MEMBERS ? "logistic" : "group";

  return {
    proposals: result.proposals.map((proposal) => toGroupProposal(proposal, reasonsMode)),
    days: result.days,
    shortened: result.shortened,
    reasonsMode,
  };
}
