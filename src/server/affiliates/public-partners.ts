import "server-only";
import { asc, eq } from "drizzle-orm";
import { affiliatePartners } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";

// Partner attivi per la pagina /affiliazioni: solo le colonne pubbliche (nome, verticali, stato).
// Template, host e nome della variabile d'ambiente non escono da qui né dalla tabella.

export type PublicPartner = {
  partner: string;
  name: string;
  verticals: string[];
};

export async function listActivePartners(): Promise<PublicPartner[]> {
  return dbPublic((tx) =>
    tx
      .select({
        partner: affiliatePartners.partner,
        name: affiliatePartners.name,
        verticals: affiliatePartners.verticals,
      })
      .from(affiliatePartners)
      .where(eq(affiliatePartners.isActive, true))
      .orderBy(asc(affiliatePartners.name)),
  );
}
