import { asc } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, areas, media, places, products, suppliers, producers } from "@/server/db/schema";
import type { ShopFormOptions } from "@/lib/shop/form-values";

// Opzioni dei menu dei form admin dello shop (fornitori, produttori, aree, luoghi, attività,
// prodotti per la box, foto della galleria). Solo admin; le letture passano da dbAdmin.

export async function listShopFormOptions(): Promise<ShopFormOptions> {
  await requireAdmin();
  const [supplierRows, producerRows, areaRows, placeRows, activityRows, productRows, mediaRows] = await Promise.all([
    dbAdmin.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    dbAdmin.select({ id: producers.id, name: producers.name }).from(producers).orderBy(asc(producers.name)),
    dbAdmin.select({ id: areas.id, name: areas.nameIt }).from(areas).orderBy(asc(areas.sort)),
    dbAdmin.select({ id: places.id, name: places.name }).from(places).orderBy(asc(places.name)),
    dbAdmin.select({ id: activities.id, title: activities.title }).from(activities).orderBy(asc(activities.title)),
    dbAdmin.select({ id: products.id, title: products.title }).from(products).orderBy(asc(products.title)),
    dbAdmin
      .select({ id: media.id, altIt: media.altIt, creditText: media.creditText })
      .from(media)
      .orderBy(asc(media.createdAt)),
  ]);
  return {
    suppliers: supplierRows,
    producers: producerRows,
    areas: areaRows,
    places: placeRows,
    activities: activityRows,
    products: productRows,
    media: mediaRows.map((m) => ({ id: m.id, label: m.altIt ?? m.creditText ?? m.id })),
  };
}
