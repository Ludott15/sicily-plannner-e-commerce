import { jsonLd } from "@/lib/seo";

// Dati strutturati schema.org, renderizzati lato server insieme alla pagina.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
