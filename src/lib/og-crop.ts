// Ritaglio di una foto su una scatola di dimensioni fisse (anteprime social, immagini verticali).
// Logica pura, testata in unit: la scala copre la scatola, poi la finestra si centra sul punto
// focale (coordinate relative 0..1) senza uscire dall'immagine.

export type Box = { width: number; height: number };
export type Focal = { x: number; y: number };
export type CoverCrop = { resize: Box; extract: { left: number; top: number; width: number; height: number } };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function coverCrop(source: Box, target: Box, focal: Focal): CoverCrop {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = Math.max(target.width, Math.ceil(source.width * scale));
  const height = Math.max(target.height, Math.ceil(source.height * scale));
  const left = clamp(Math.round(focal.x * width - target.width / 2), 0, width - target.width);
  const top = clamp(Math.round(focal.y * height - target.height / 2), 0, height - target.height);
  return { resize: { width, height }, extract: { left, top, width: target.width, height: target.height } };
}
