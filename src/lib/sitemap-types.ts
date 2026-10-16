// Tipi delle sitemap (src/app/sitemap.ts): ciascuno è una sitemap /sitemap/<tipo>.xml, con
// l'indice su /sitemap.xml. Stanno qui perché robots.ts li elenca e il file della sitemap può
// esportare solo le funzioni che Next riconosce.
// I prodotti non ci sono ancora (passo 7): quando ci saranno si aggiunge il tipo "prodotti".

export const SITEMAP_TYPES = ["pagine", "luoghi", "attivita", "itinerari", "aree", "guide", "voli"] as const;

export type SitemapType = (typeof SITEMAP_TYPES)[number];

export function isSitemapType(value: string): value is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(value);
}
