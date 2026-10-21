import "server-only";
import { and, eq } from "drizzle-orm";
import { areas, places } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";

// Nome nel catalogo di uno slug scelto nella ricerca: il link firmato porta lo slug, il server ne
// ricava il nome per il segnaposto {place}. Luoghi attivi; per l'alloggio anche le aree (allowArea).
// Lettura pubblica (dbPublic, ruolo anon): solo ciò che il catalogo mostra già. null se lo slug non c'è.

export async function catalogPlaceName(slug: string, locale: string, allowArea: boolean): Promise<string | null> {
  if (slug === "") return null;
  const [place] = await dbPublic((tx) =>
    tx
      .select({ name: places.name })
      .from(places)
      .where(and(eq(places.slug, slug), eq(places.isActive, true)))
      .limit(1),
  );
  if (place) return place.name;
  if (!allowArea) return null;

  const [area] = await dbPublic((tx) =>
    tx.select({ nameIt: areas.nameIt, nameEn: areas.nameEn }).from(areas).where(eq(areas.slug, slug)).limit(1),
  );
  if (!area) return null;
  return locale === "en" ? area.nameEn : area.nameIt;
}
