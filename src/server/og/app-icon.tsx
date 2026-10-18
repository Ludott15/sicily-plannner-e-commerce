import "server-only";
import { ImageResponse } from "next/og";
import { brandAppIcon } from "@generated/design/brand";
import { ogColors as c } from "@generated/design/og";

// Icona quadrata dell'app (Apple touch e manifest PWA): piastrella coccio a tutto campo con la
// rosetta in calce, più grande che nel marchio. Il sistema può mascherarla: il bordo della
// piastrella è il bordo dell'icona.
export const appIconSizes = [180, 192, 512] as const;
export type AppIconSize = (typeof appIconSizes)[number];

export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <svg width={size} height={size} viewBox={brandAppIcon.viewBox}>
          <path fill={c.coccio} d={brandAppIcon.tile} />
          <path fill={c.calce} d={brandAppIcon.rosette} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
