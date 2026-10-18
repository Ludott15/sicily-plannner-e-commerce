// Copia il worker di MapLibre (e il modulo condiviso che importa) in public/vendor/maplibre/, così il
// browser lo carica da un URL stabile: il percorso relativo che MapLibre calcola da import.meta.url non
// sopravvive al bundler di Next. Gira prima di dev e build; i file copiati non si versionano.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const target = join(root, "public", "vendor", "maplibre");
mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(target, file));
}
