import { appIcon, type AppIconSize, appIconSizes } from "@/server/og/app-icon";

// Icone PWA del manifest: /icons/icon-192.png e /icons/icon-512.png. Il nome con l'estensione
// resta fuori dal middleware di localizzazione (che esclude i percorsi con un punto).
export const dynamic = "force-static";

export function generateStaticParams() {
  return appIconSizes.map((size) => ({ file: `icon-${size}.png` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = /^icon-(\d+)\.png$/.exec(file);
  const size = Number(match?.[1]);
  if (!match || !appIconSizes.some((s): s is AppIconSize => s === size)) {
    return new Response(null, { status: 404 });
  }
  return appIcon(size);
}
