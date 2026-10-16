import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { chatStatus } from "./queries";
import { applyAcceptedProposal, type ProposalRow } from "./apply";
import { runChatTool, type ToolState } from "./tools";

// Test di integrazione del chatbot (passo 9.1) su Postgres locale. Tutto ciò che creano usa il
// prefisso int- e viene annullato dal pulizia globale. Il modello non è chiamato: gli strumenti e le
// transazioni sono quelli veri, con dbAsUser e RLS.

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const alice: DbUser = { id: randomUUID(), email: `int-alice-${SUFFIX}@example.com` };
const bob: DbUser = { id: randomUUID(), email: `int-bob-${SUFFIX}@example.com` };
const carol: DbUser = { id: randomUUID(), email: `int-carol-${SUFFIX}@example.com` };
const dave: DbUser = { id: randomUUID(), email: `int-dave-${SUFFIX}@example.com` };
const guest: DbUser = { id: randomUUID(), is_anonymous: true };

let activityId = "";
let groupTripId = "";
let personalTripId = "";

// Il risultato di uno strumento è <dati_catalogo>JSON escapato</dati_catalogo>: lo riporta a JSON.
function parseResult(text: string): Record<string, unknown> {
  const inner = text.replace(/^<dati_catalogo>/, "").replace(/<\/dati_catalogo>$/, "");
  return JSON.parse(inner.replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as Record<string, unknown>;
}

function stateFor(user: DbUser, itineraryId: string | null, knownActivityIds: string[] = []): ToolState {
  return {
    user,
    locale: "it",
    itineraryId,
    knownActivityIds: new Set(knownActivityIds),
    knownStopIds: new Set(),
    pending: [],
  };
}

beforeAll(async () => {
  process.env.CHAT_TEST_MODEL = "scripted";
  for (const user of [alice, bob, carol, dave]) {
    await dbAdmin.execute(sql`insert into auth.users (id, email, raw_user_meta_data)
      values (${user.id}, ${user.email}, '{"full_name": "Int"}')`);
  }
  await dbAdmin.execute(sql`insert into auth.users (id, is_anonymous) values (${guest.id}, true)`);

  // Gusti: tre membri del gruppo con pesi diversi sul mare (5, 1, 3): la media è 3.
  await dbAdmin.execute(sql`
    update public.profiles set onboarding_completed_at = now()
    where id in (${bob.id}, ${carol.id}, ${dave.id})`);
  await dbAdmin.execute(sql`
    insert into public.preference_weights (user_id, interest_key, explicit) values
      (${bob.id}, 'sea', 5), (${carol.id}, 'sea', 1), (${dave.id}, 'sea', 3)`);

  const [area] = await dbAdmin.execute<{ id: string }>(sql`select id from public.areas order by slug limit 1`);
  const [place] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.places (slug, name, province, area_id, lat, lng)
    values (${`int-place-${SUFFIX}`}, ${`int- Luogo ${SUFFIX}`}, 'SR', ${area!.id}::uuid, 37.07, 15.29)
    returning id`);
  const [activity] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.activities (slug, place_id, title, duration_min, is_active)
    values (${`int-act-${SUFFIX}`}, ${place!.id}::uuid, ${`int- Attività ${SUFFIX}`}, 90, false)
    returning id`);
  activityId = activity!.id;
  await dbAdmin.execute(sql`insert into public.activity_interests (activity_id, interest_key, strength)
    values (${activityId}::uuid, 'sea', 3)`);
  await dbAdmin.execute(sql`update public.activities set is_active = true where id = ${activityId}::uuid`);

  const [group] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.groups (name, owner_id) values (${`int- Gruppo ${SUFFIX}`}, ${alice.id}::uuid) returning id`);
  await dbAdmin.execute(sql`
    insert into public.group_members (group_id, user_id) values
      (${group!.id}::uuid, ${alice.id}::uuid), (${group!.id}::uuid, ${bob.id}::uuid),
      (${group!.id}::uuid, ${carol.id}::uuid), (${group!.id}::uuid, ${dave.id}::uuid)
    on conflict do nothing`);
  const [groupTrip] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.itineraries (owner_id, group_id, title, days)
    values (${alice.id}::uuid, ${group!.id}::uuid, ${`int- Viaggio di gruppo ${SUFFIX}`}, 3) returning id`);
  groupTripId = groupTrip!.id;
  const [personal] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.itineraries (owner_id, title, days)
    values (${alice.id}::uuid, ${`int- Viaggio personale ${SUFFIX}`}, 3) returning id`);
  personalTripId = personal!.id;
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${alice.id}, ${bob.id}, ${carol.id}, ${dave.id}, ${guest.id})`);
  await dbAdmin.execute(sql`delete from public.activities where slug = ${`int-act-${SUFFIX}`}`);
  await dbAdmin.execute(sql`delete from public.activities where slug = ${`int-inattiva-${SUFFIX}`}`);
  await dbAdmin.execute(sql`delete from public.places where slug = ${`int-place-${SUFFIX}`}`);
});

describe("get_user_profile in un viaggio di gruppo", () => {
  it("restituisce solo aggregati del gruppo: nessun id e nessun peso di un singolo membro", async () => {
    const run = await runChatTool(stateFor(alice, groupTripId), "get_user_profile", {});
    expect(run.isError).toBe(false);
    const data = parseResult(run.result) as { group: { private: boolean; withPreferences: number; interests: { key: string; weight: number }[] } };
    expect(data.group.private).toBe(false);
    expect(data.group.withPreferences).toBe(3);
    const sea = data.group.interests.find((interest) => interest.key === "sea");
    expect(sea?.weight).toBe(3);
    for (const member of [bob, carol, dave]) {
      expect(run.result).not.toContain(member.id);
    }
  });

  it("un membro non vede i gusti di un altro senza passare dal gruppo", async () => {
    const run = await runChatTool(stateFor(bob, personalTripId), "get_user_profile", {});
    expect(run.result).not.toContain(carol.id);
    expect(run.result).not.toContain(dave.id);
  });
});

describe("proposta di modifica accettata", () => {
  it("l'accettazione aggiunge la tappa al viaggio personale", async () => {
    const state = stateFor(alice, personalTripId, [activityId]);
    const run = await runChatTool(state, "apply_itinerary_changes", {
      changes: [{ op: "add", activityId, dayIndex: 0 }],
    });
    expect(run.isError).toBe(false);
    expect(state.pending).toHaveLength(1);

    // Fixture: sessione e messaggio dell'assistente come admin; la proposta come farebbe il server.
    const [session] = await dbAdmin.execute<{ id: string }>(sql`
      insert into public.chat_sessions (user_id, itinerary_id, title)
      values (${alice.id}::uuid, ${personalTripId}::uuid, 'int- Sessione') returning id`);
    const [message] = await dbAdmin.execute<{ id: string }>(sql`
      insert into public.chat_messages (session_id, role, content)
      values (${session!.id}::uuid, 'assistant', '{"kind":"text","text":"Proposta."}'::jsonb) returning id`);
    const payload = state.pending[0]!.payload;
    await dbAsUser(alice, (tx) =>
      tx.execute(sql`
        select public.create_chat_proposal(${session!.id}::uuid, ${message!.id}::uuid, 'itinerary', ${JSON.stringify(payload)}::jsonb)`),
    );
    const [proposal] = await dbAdmin.execute<ProposalRow>(sql`
      select id, kind, payload from public.chat_proposals where message_id = ${message!.id}::uuid`);

    const before = await dbAdmin.execute<{ n: number }>(sql`select count(*)::int as n from public.itinerary_items where itinerary_id = ${personalTripId}::uuid`);
    await dbAsUser(alice, async (tx) => {
      const [decided] = await tx.execute<ProposalRow>(sql`select * from public.decide_chat_proposal(${proposal!.id}::uuid, 'accepted')`);
      await applyAcceptedProposal(tx, alice, decided!);
    });
    const after = await dbAdmin.execute<{ n: number }>(sql`select count(*)::int as n from public.itinerary_items where itinerary_id = ${personalTripId}::uuid`);
    expect(after[0]!.n).toBe(before[0]!.n + 1);
  });

  it("una proposta già decisa non si decide di nuovo", async () => {
    const [proposal] = await dbAdmin.execute<{ id: string }>(sql`
      select id from public.chat_proposals where status = 'accepted' order by created_at desc limit 1`);
    await expect(
      dbAsUser(alice, (tx) => tx.execute(sql`select * from public.decide_chat_proposal(${proposal!.id}::uuid, 'rejected')`)),
    ).rejects.toMatchObject({ cause: { message: "chat_proposal_decided" } });
  });

  it("un membro non può togliere una tappa del viaggio di gruppo", async () => {
    const state = stateFor(bob, groupTripId, [activityId]);
    state.knownStopIds.add(randomUUID());
    const run = await runChatTool(state, "apply_itinerary_changes", {
      changes: [{ op: "remove", stopId: [...state.knownStopIds][0] }],
    });
    expect(run.isError).toBe(true);
    expect(run.result).toContain("not_allowed_for_member");
  });
});

// Una proposta con payload scritto a mano (come farebbe un client che chiama create_chat_proposal):
// la sessione e il messaggio sono dell'utente, il payload no. Accettarla deve rileggere e rifiutare.
async function forgedProposal(owner: DbUser, itineraryId: string, kind: "itinerary" | "preference", payload: unknown): Promise<string> {
  const [session] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.chat_sessions (user_id, itinerary_id, title)
    values (${owner.id}::uuid, ${itineraryId}::uuid, 'int- Sessione forgiata') returning id`);
  const [message] = await dbAdmin.execute<{ id: string }>(sql`
    insert into public.chat_messages (session_id, role, content)
    values (${session!.id}::uuid, 'assistant', '{"kind":"text","text":"Proposta."}'::jsonb) returning id`);
  const [proposal] = await dbAsUser(owner, (tx) =>
    tx.execute<{ id: string }>(sql`
      select public.create_chat_proposal(${session!.id}::uuid, ${message!.id}::uuid, ${kind}, ${JSON.stringify(payload)}::jsonb) as id`),
  );
  return proposal!.id;
}

// Accetta come farebbe l'azione: decisione e applicazione nella stessa transazione.
function acceptAs(user: DbUser, proposalId: string) {
  return dbAsUser(user, async (tx) => {
    const [row] = await tx.execute<ProposalRow>(sql`select * from public.decide_chat_proposal(${proposalId}::uuid, 'accepted')`);
    await applyAcceptedProposal(tx, user, row!);
  });
}

describe("payload non fidato alla accettazione", () => {
  let inactiveActivityId = "";
  let groupStopId = "";

  beforeAll(async () => {
    const [place] = await dbAdmin.execute<{ id: string }>(sql`
      select id from public.places where slug like 'int-place-%' limit 1`);
    const [inactive] = await dbAdmin.execute<{ id: string }>(sql`
      insert into public.activities (slug, place_id, title, duration_min, is_active)
      values (${`int-inattiva-${SUFFIX}`}, ${place!.id}::uuid, ${`int- Inattiva ${SUFFIX}`}, 30, false) returning id`);
    inactiveActivityId = inactive!.id;
    const [stop] = await dbAdmin.execute<{ id: string }>(sql`
      insert into public.itinerary_items (itinerary_id, day_index, position, activity_id)
      values (${groupTripId}::uuid, 0, 0, ${activityId}::uuid) returning id`);
    groupStopId = stop!.id;
  });

  it("un'attività inattiva non si aggiunge, anche se la proposta la indica", async () => {
    const proposalId = await forgedProposal(alice, personalTripId, "itinerary", {
      itineraryId: personalTripId,
      changes: [{ op: "add", activityId: inactiveActivityId, dayIndex: 0, title: "int- Inattiva" }],
      asGroupProposal: false,
    });
    await expect(acceptAs(alice, proposalId)).rejects.toMatchObject({ code: "activity_not_available" });
  });

  it("un giorno fuori dal viaggio non si aggiunge", async () => {
    const proposalId = await forgedProposal(alice, personalTripId, "itinerary", {
      itineraryId: personalTripId,
      changes: [{ op: "add", activityId, dayIndex: 9, title: "int- Attività" }],
      asGroupProposal: false,
    });
    await expect(acceptAs(alice, proposalId)).rejects.toMatchObject({ code: "day_out_of_range" });
  });

  it("un membro non proprietario che forgia una rimozione dal viaggio di gruppo viene respinto", async () => {
    const proposalId = await forgedProposal(bob, groupTripId, "itinerary", {
      itineraryId: groupTripId,
      changes: [{ op: "remove", stopId: groupStopId, title: "int- Attività" }],
      asGroupProposal: false,
    });
    await expect(acceptAs(bob, proposalId)).rejects.toMatchObject({ code: "not_allowed_for_member" });
    const [stillThere] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.itinerary_items where id = ${groupStopId}::uuid`);
    expect(stillThere!.n).toBe(1);
  });

  it("un interesse che non esiste nella tabella interests viene respinto", async () => {
    const proposalId = await forgedProposal(alice, personalTripId, "preference", {
      interestKey: "non_esiste",
      interestLabel: "Non esiste",
      from: 0,
      to: 5,
      reason: "Prova.",
    });
    await expect(acceptAs(alice, proposalId)).rejects.toMatchObject({ code: "unknown_interest" });
  });

  it("il flag asGroupProposal forgiato non cambia il ruolo: il proprietario aggiunge direttamente", async () => {
    const before = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.itinerary_items where itinerary_id = ${personalTripId}::uuid`);
    const proposalId = await forgedProposal(alice, personalTripId, "itinerary", {
      itineraryId: personalTripId,
      changes: [{ op: "add", activityId, dayIndex: 1, title: "int- Attività" }],
      asGroupProposal: true,
    });
    await acceptAs(alice, proposalId);
    const after = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.itinerary_items where itinerary_id = ${personalTripId}::uuid`);
    expect(after[0]!.n).toBe(before[0]!.n + 1);
  });
});

describe("ospite", () => {
  it("il limite giornaliero dell'ospite è quello degli ospiti", async () => {
    const status = await chatStatus(guest);
    expect(status.limit).toBe(10);
    expect(status.enabled).toBe(true);
    expect(status.remainingToday).toBe(10);
  });
});
