import "server-only";
import { ImageResponse } from "next/og";
import { brandMark } from "@generated/design/brand";
import { ogColors as c } from "@generated/design/og";

// Icona quadrata del marchio (Apple touch e manifest PWA): fondo coccio, isola e sole in calce.
// Il marchio sta dentro il 72% del lato, così resta intero anche con le maschere del sistema.
export const appIconSizes = [180, 192, 512] as const;
export type AppIconSize = (typeof appIconSizes)[number];

export function appIcon(size: number) {
  const inner = Math.round(size * 0.72);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: c.coccio,
        }}
      >
        <svg width={inner} height={inner} viewBox={brandMark.viewBox}>
          <path fill={c.calce} d={brandMark.body} />
          <path fill={c.calce} d={brandMark.sun} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
