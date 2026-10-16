import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brandMark } from "@generated/design/brand";
import { ogColors as c, ogFamilies } from "@generated/design/og";
import { BRAND_NAME } from "@/lib/brand";
import type { CoverMedia } from "@/lib/media";
import { ogPhoto } from "./photo";

// Immagine verticale 1080×1920 per i video (contenuti): la foto in alto, il titolo, le tappe
// principali sulla linea del percorso e il marchio. Nessun dato personale: solo il catalogo.
// Colori e famiglie dai token (generated/design/og.ts), font come nelle anteprime social.

export const verticalSize = { width: 1080, height: 1920 };
export const verticalContentType = "image/png";
const PHOTO_HEIGHT = 860;
const MAX_LINES = 6;

export type VerticalLine = { day: number | null; text: string };

export type VerticalContent = {
  kind: "itinerario" | "luogo";
  title: string;
  // Solo per gli itinerari: giorni totali. Solo per i luoghi: codice provincia.
  days: number;
  province: string;
  lines: VerticalLine[];
  cover: CoverMedia | null;
};

const fontFile = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));

// Etichette tradotte: l'eyebrow in alto e la parola "Giorno" davanti a ogni tappa del giorno.
export type VerticalLabels = { eyebrow: string; day: (n: number) => string };

export async function verticalImage(content: VerticalContent, labels: VerticalLabels) {
  const [display, sans, photo] = await Promise.all([
    fontFile("Fraunces-SemiBold-Soft50.ttf"),
    fontFile("InstrumentSans-Medium.ttf"),
    ogPhoto(content.cover, { width: verticalSize.width, height: PHOTO_HEIGHT }),
  ]);
  const lines = content.lines.slice(0, MAX_LINES);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: c.calce,
          color: c.lava,
          fontFamily: ogFamilies.sans,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={verticalSize.width}
            height={PHOTO_HEIGHT}
            style={{ width: verticalSize.width, height: PHOTO_HEIGHT, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: verticalSize.width,
              height: PHOTO_HEIGHT,
              background: c["coccio-tint"],
            }}
          >
            <svg width={360} height={360} viewBox={brandMark.viewBox}>
              <path fill={c.coccio} d={brandMark.body} />
              <path fill={c.coccio} d={brandMark.sun} />
            </svg>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
            padding: "64px 80px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: 3,
                color: c["coccio-text"],
                textTransform: "uppercase",
              }}
            >
              {labels.eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: ogFamilies.display,
                fontWeight: 600,
                fontSize: content.title.length > 36 ? 84 : 104,
                lineHeight: 1.02,
                letterSpacing: -2,
              }}
            >
              {content.title}
            </div>
          </div>

          {lines.length > 0 && (
            // Linea del percorso: una linea tratteggiata che collega le tappe, un punto per tappa.
            <div style={{ display: "flex", flexDirection: "column", gap: 18, position: "relative", paddingLeft: 52 }}>
              <div
                style={{
                  position: "absolute",
                  left: 11,
                  top: 12,
                  bottom: 12,
                  borderLeft: `2px dashed ${c["lava-muted"]}`,
                }}
              />
              {lines.map((line, i) => (
                <div
                  key={`${line.text}-${i}`}
                  style={{ display: "flex", position: "relative", alignItems: "center", gap: 22, fontSize: 40, lineHeight: 1.25 }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -52,
                      top: 14,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: c.lava,
                      border: `4px solid ${c.calce}`,
                    }}
                  />
                  {line.day !== null && (
                    <div
                      style={{
                        display: "flex",
                        fontSize: 26,
                        fontWeight: 600,
                        letterSpacing: 2,
                        color: c["lava-muted"],
                        textTransform: "uppercase",
                      }}
                    >
                      {labels.day(line.day)}
                    </div>
                  )}
                  <div style={{ display: "flex" }}>{line.text}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width={64} height={64} viewBox={brandMark.viewBox}>
              <path fill={c.coccio} d={brandMark.body} />
              <path fill={c.coccio} d={brandMark.sun} />
            </svg>
            <div style={{ display: "flex", fontFamily: ogFamilies.display, fontWeight: 600, fontSize: 64, letterSpacing: -1.5 }}>
              {BRAND_NAME}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...verticalSize,
      fonts: [
        { name: ogFamilies.display, data: display, weight: 600, style: "normal" },
        { name: ogFamilies.sans, data: sans, weight: 500, style: "normal" },
      ],
    },
  );
}
