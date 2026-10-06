import { createClient as createAnonClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { isMasterPath, isServablePath } from "@/lib/media";
import { createClient } from "@/server/supabase/server";

// File del bucket privato "media" (docs/IMMAGINI.md). Lo storage decide con le policy su
// storage.objects:
// - prima con il ruolo anon: passano solo le varianti correnti dei media pubblici, che
//   tornano con cache pubblica breve (un'ora sulla CDN: un media tolto dalla pubblicazione
//   smette di essere servito entro quel tempo);
// - se il visitatore ha una sessione (l'admin che guarda l'anteprima di un media non ancora
//   pubblico), si riprova con la sua sessione e la risposta non va in cache condivisa.
// Gli originali (master) si servono solo con la sessione (la policy li concede solo all'admin,
// per scegliere il punto focale); i caricamenti in incoming/ mai.

const CONTENT_TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  png: "image/png",
};

const anon = createAnonClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const master = isMasterPath(path);
  if (!master && !isServablePath(path)) return new Response(null, { status: 404 });

  let cache = "public, max-age=300, s-maxage=3600";
  let { data } = master ? { data: null } : await anon.storage.from("media").download(path);
  if (!data) {
    const session = await createClient();
    ({ data } = await session.storage.from("media").download(path));
    cache = "private, no-store";
  }
  if (!data) return new Response(null, { status: 404 });

  const ext = path.slice(path.lastIndexOf(".") + 1);
  return new Response(data.stream(), {
    headers: {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "cache-control": cache,
      "x-content-type-options": "nosniff",
      // Gli SVG aperti direttamente non eseguono script né caricano risorse esterne.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
