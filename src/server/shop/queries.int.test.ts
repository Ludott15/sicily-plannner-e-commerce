import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import {
  activities,
  places,
  productLinks,
  producers,
  products,
  suppliers,
} from "@/server/db/schema";
import { getProduct, getProducer, listProducts, productsForActivity, productsForPlace } from "./queries";

// Letture pubbliche dello shop, come le vede il visitatore (dbPublic). Tutto ha il prefisso int-
// e il tag della run: i test filtrano sui propri slug, perché il database locale può avere dati veri.
// Il costo, il codice del fornitore e l'id del fornitore non devono comparire in nessuna risposta.

const tag = `g${Date.now()}`;
const id = () => randomUUID();

const ids = {
  placeOpen: id(),
  placeClosed: id(),
  activityClosed: id(),
  supplierOn: id(),
  supplierOff: id(),
  producerPublic: id(),
  producerPrivate: id(),
  productOpen: id(),
  productClosed: id(),
  productPrivate: id(),
  productSupplierOff: id(),
};

const slug = (name: string) => `int-${name}-${tag}`;
const ownProductIds = [ids.productOpen, ids.productClosed, ids.productPrivate, ids.productSupplierOff];

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(places).values([
      { id: ids.placeOpen, slug: slug("luogo-aperto"), name: "int- luogo aperto", province: "PA", lat: 38, lng: 13, isActive: true },
      { id: ids.placeClosed, slug: slug("luogo-chiuso"), name: "int- luogo chiuso", province: "PA", lat: 38, lng: 13, isActive: false },
    ]);
    await tx.insert(activities).values({
      id: ids.activityClosed,
      slug: slug("attivita-chiusa"),
      placeId: ids.placeOpen,
      title: "int- attività inattiva",
      durationMin: 60,
      isActive: false,
    });
    await tx.insert(suppliers).values([
      { id: ids.supplierOn, name: `int- fornitore ${tag}`, kind: "manual", contactEmail: `on-${tag}@example.com`, isActive: true },
      { id: ids.supplierOff, name: `int- fornitore spento ${tag}`, kind: "manual", contactEmail: `off-${tag}@example.com`, isActive: false },
    ]);
    await tx.insert(producers).values([
      { id: ids.producerPublic, slug: slug("produttore"), name: "int- produttore pubblico", email: `pub-${tag}@example.com`, storyIt: "Storia di prova", isPublic: true, isActive: true },
      { id: ids.producerPrivate, slug: slug("produttore-privato"), name: "int- produttore privato", email: `priv-${tag}@example.com`, isPublic: false, isActive: true },
    ]);

    const base = {
      producerId: ids.producerPublic,
      supplierId: ids.supplierOn,
      category: "dolci",
      vatRate: 10,
      weightG: 200,
      costCents: 500,
      allergens: ["milk", "gluten"],
      allergensDeclared: true,
      ingredientsIt: "Farina, uova",
      formatLabel: "pacco 200 g",
      priceCents: 1000,
      isActive: true,
    };
    await tx.insert(products).values([
      { ...base, id: ids.productOpen, slug: slug("aperto"), supplierSku: `OPEN-${tag}`, title: "int- prodotto aperto" },
      { ...base, id: ids.productClosed, slug: slug("chiuso"), supplierSku: `CLOSED-${tag}`, title: "int- prodotto chiuso", isActive: false },
      { ...base, id: ids.productPrivate, slug: slug("privato"), supplierSku: `PRIV-${tag}`, title: "int- prodotto privato", producerId: ids.producerPrivate },
      { ...base, id: ids.productSupplierOff, slug: slug("fornitore-spento"), supplierSku: `OFF-${tag}`, title: "int- fornitore spento", supplierId: ids.supplierOff },
    ]);

    await tx.insert(productLinks).values([
      { productId: ids.productOpen, kind: "place", targetId: ids.placeOpen, position: 0 },
      { productId: ids.productOpen, kind: "place", targetId: ids.placeClosed, position: 1 },
      { productId: ids.productOpen, kind: "activity", targetId: ids.activityClosed, position: 0 },
    ]);
  });
});

afterAll(async () => {
  await dbAdmin.delete(products).where(inArray(products.id, ownProductIds));
  await dbAdmin.delete(producers).where(inArray(producers.id, [ids.producerPublic, ids.producerPrivate]));
  await dbAdmin.delete(suppliers).where(inArray(suppliers.id, [ids.supplierOn, ids.supplierOff]));
  await dbAdmin.delete(activities).where(inArray(activities.id, [ids.activityClosed]));
  await dbAdmin.delete(places).where(inArray(places.id, [ids.placeOpen, ids.placeClosed]));
});

const own = (slugs: string[]) => slugs.filter((s) => s.startsWith(`int-`) && s.endsWith(tag));

describe("prodotti vendibili (dbPublic)", () => {
  it("mostra solo i prodotti attivi, di produttori pubblici e con fornitore attivo", async () => {
    const slugs = own((await listProducts({}, "it")).map((p) => p.slug));
    expect(slugs).toEqual([slug("aperto")]);
  });

  it("la scheda non contiene costo, codice e id del fornitore", async () => {
    const detail = await getProduct(slug("aperto"), "it");
    expect(detail).not.toBeNull();
    const json = JSON.stringify(detail);
    expect(json).not.toContain(`OPEN-${tag}`);
    expect(json).not.toContain("costCents");
    expect(json).not.toContain("supplierId");
    expect(json).not.toContain(ids.supplierOn);
    expect(json).not.toContain(`on-${tag}@example.com`);
  });

  it("la scheda restituisce allergeni validi e solo i collegamenti attivi", async () => {
    const detail = await getProduct(slug("aperto"), "it");
    expect(detail?.allergens).toEqual(["gluten", "milk"]);
    expect(detail?.links.filter((l) => l.kind === "place").map((l) => l.slug)).toEqual([slug("luogo-aperto")]);
    expect(detail?.links.filter((l) => l.kind === "activity")).toEqual([]);
  });

  it("un prodotto non vendibile non ha scheda", async () => {
    expect(await getProduct(slug("chiuso"), "it")).toBeNull();
    expect(await getProduct(slug("privato"), "it")).toBeNull();
    expect(await getProduct(slug("fornitore-spento"), "it")).toBeNull();
  });

  it("il produttore privato non ha pagina", async () => {
    expect(await getProducer(slug("produttore-privato"), "it")).toBeNull();
    const pub = await getProducer(slug("produttore"), "it");
    expect(pub?.story).toBe("Storia di prova");
    expect(own((await listProducts({ producer: slug("produttore") }, "it")).map((p) => p.slug))).toEqual([slug("aperto")]);
  });

  it("collegamenti: il luogo attivo vede il prodotto; il luogo chiuso non compare nella scheda", async () => {
    expect(own((await productsForPlace(ids.placeOpen, "it")).map((p) => p.slug))).toEqual([slug("aperto")]);
    expect((await getProduct(slug("aperto"), "it"))?.links.map((l) => l.slug)).not.toContain(slug("luogo-chiuso"));
    expect(await productsForActivity(ids.activityClosed, "it")).toEqual([]);
  });
});
