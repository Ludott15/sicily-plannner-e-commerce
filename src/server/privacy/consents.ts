import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { CONSENT_TEXT_VERSIONS, isConsentKind, type ConsentKind } from "@/lib/consents";
import { userConsents } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";

// Registro dei consensi (passo 8.2). Ogni scrittura passa da public.record_consent (SECURITY
// DEFINER): qui si decide solo se la scelta cambia rispetto allo stato attuale, così il registro
// non si riempie di righe identiche. La versione del testo la sceglie il server.

export type ConsentRecord = {
  kind: ConsentKind;
  granted: boolean;
  textVersion: string;
  createdAt: Date;
};

// Stato attuale di un consenso per l'utente della transazione (null se mai chiesto).
export async function currentConsentTx(tx: UserTx, kind: ConsentKind): Promise<boolean | null> {
  const [row] = await tx.execute<{ granted: boolean | null }>(
    sql`select public.current_consent(${kind}) as granted`,
  );
  return row?.granted ?? null;
}

// Registra la scelta solo se diversa dallo stato attuale. Il primo "no" esplicito (es. onboarding)
// si registra: non è uno stato assente ma una risposta.
export async function setConsentTx(tx: UserTx, kind: ConsentKind, granted: boolean): Promise<void> {
  if ((await currentConsentTx(tx, kind)) === granted) return;
  await tx.execute(
    sql`select public.record_consent(${kind}, ${granted}, ${CONSENT_TEXT_VERSIONS[kind]})`,
  );
}

export async function setConsent(user: DbUser, kind: ConsentKind, granted: boolean): Promise<void> {
  await dbAsUser(user, (tx) => setConsentTx(tx, kind, granted));
}

// Ritira un consenso concesso (es. "Cancella questi dati"): non registra nulla se non era concesso.
export async function withdrawConsent(user: DbUser, kind: ConsentKind): Promise<void> {
  await dbAsUser(user, async (tx) => {
    if ((await currentConsentTx(tx, kind)) === true) {
      await setConsentTx(tx, kind, false);
    }
  });
}

// Storico dei consensi dell'utente, dal più recente (per l'export e la pagina Privacy).
export async function listConsents(user: DbUser): Promise<ConsentRecord[]> {
  const rows = await dbAsUser(user, (tx) =>
    tx
      .select({
        kind: userConsents.kind,
        granted: userConsents.granted,
        textVersion: userConsents.textVersion,
        createdAt: userConsents.createdAt,
      })
      .from(userConsents)
      .where(eq(userConsents.userId, user.id))
      .orderBy(desc(userConsents.id)),
  );
  return rows.flatMap((row) =>
    isConsentKind(row.kind) ? [{ kind: row.kind, granted: row.granted, textVersion: row.textVersion, createdAt: row.createdAt }] : [],
  );
}
