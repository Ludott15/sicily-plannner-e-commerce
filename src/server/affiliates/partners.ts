import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dbPublic } from "@/server/db/public";
import { isPartnerIdEnvName } from "@/lib/partner-env-names";
import type { Vertical } from "./vertical-links";

export { PARTNER_ID_ENV_NAMES, type PartnerIdEnvName } from "@/lib/partner-env-names";

// Configurazione dei partner (affiliate_partners) per il generatore dei link. Si legge con
// public.affiliate_partner_config (SECURITY DEFINER, ruolo anon): template e host non si leggono
// dalla tabella dal client. L'ID del partner sta in una variabile d'ambiente, indicata dalla
// riga (partner_id_env): il valore non esce mai da questo modulo.

export type PartnerConfig = {
  partner: string;
  name: string;
  verticals: string[];
  searchUrlTemplate: string | null;
  allowedHosts: string[];
  subidParam: string | null;
  partnerIdEnv: string | null;
  isActive: boolean;
};

export type ReadyPartner = {
  config: PartnerConfig & { searchUrlTemplate: string };
  partnerId: string;
};

// Verticale -> partner che la serve (per le pagine e i chip). Aggiungere un partner: una riga qui.
export const VERTICAL_PARTNER: Record<Vertical, string> = {
  lodging: "booking",
  car: "discovercars",
};

const configRowSchema = z.object({
  partner: z.string(),
  name: z.string(),
  verticals: z.array(z.string()),
  search_url_template: z.string().nullable(),
  allowed_hosts: z.array(z.string()),
  subid_param: z.string().nullable(),
  partner_id_env: z.string().nullable(),
  is_active: z.boolean(),
});

// Configurazione di un partner, null se non esiste. Una chiave che l'enum partner non conosce
// fa fallire la funzione SQL: qui diventa null.
export async function getPartnerConfig(partner: string): Promise<PartnerConfig | null> {
  const row = await loadPartnerRow(partner);
  const parsed = configRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    partner: r.partner,
    name: r.name,
    verticals: r.verticals,
    searchUrlTemplate: r.search_url_template,
    allowedHosts: r.allowed_hosts,
    subidParam: r.subid_param,
    partnerIdEnv: r.partner_id_env,
    isActive: r.is_active,
  };
}

async function loadPartnerRow(partner: string): Promise<unknown> {
  try {
    const rows = await dbPublic((tx) =>
      tx.execute<Record<string, unknown>>(
        sql`select * from public.affiliate_partner_config(${partner}::public.partner)`,
      ),
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

const PARTNER_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Valore della variabile d'ambiente indicata dalla riga del partner. Si legge solo un nome di
// PARTNER_ID_ENV_NAMES: qualunque altra variabile (segreti compresi) dà null. null anche se la
// variabile manca o il valore non ha un formato ammesso.
export function partnerIdFromEnv(envName: string | null): string | null {
  if (envName === null || !isPartnerIdEnvName(envName)) return null;
  const value = process.env[envName]?.trim();
  return value && PARTNER_ID.test(value) ? value : null;
}

// Il partner può servire la verticale: attivo, la verticale è sua, c'è un template e l'ID è configurato.
export function readyPartner(config: PartnerConfig | null, vertical: Vertical): ReadyPartner | null {
  if (!config || !config.isActive || !config.verticals.includes(vertical)) return null;
  if (config.searchUrlTemplate === null) return null;
  const partnerId = partnerIdFromEnv(config.partnerIdEnv);
  if (partnerId === null) return null;
  return { config: { ...config, searchUrlTemplate: config.searchUrlTemplate }, partnerId };
}
