import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ogColors as c, ogFamilies } from "@generated/design/og";

// Immagine di anteprima 1200×630 (schemi.md, "Condivisione"): titolo in Fraunces, linea del
// percorso con le tappe, la parola Isula. Colori e famiglie dai token (generated/design/og.ts);
// i font sono istanze statiche in assets/fonts (OFL), perché next/og non usa next/font né
// gli assi variabili: Fraunces 600 con SOFT 50 già applicato.

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const fontFile = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));

// Al massimo 5 tappe sulla linea, le altre si contano ("+3").
const MAX_STOPS = 5;

export async function ogImage({ eyebrow, title, stops }: { eyebrow: string; title: string; stops: string[] }) {
  const [display, sans, sansBold] = await Promise.all([
    fontFile("Fraunces-SemiBold-Soft50.ttf"),
    fontFile("InstrumentSans-Medium.ttf"),
    fontFile("InstrumentSans-SemiBold.ttf"),
  ]);
  const shown = stops.slice(0, MAX_STOPS);
  const more = stops.length - shown.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: c.calce,
          color: c.lava,
          fontFamily: ogFamilies.sans,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, color: c["coccio-text"], textTransform: "uppercase" }}>
            {eyebrow}
          </div>
          <div
            style={{
              fontFamily: ogFamilies.display,
              fontWeight: 600,
              fontSize: title.length > 40 ? 64 : 80,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
          {/* Linea del percorso: punti lava su una linea tratteggiata, nomi delle tappe sotto. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, maxWidth: 820 }}>
            <div style={{ display: "flex", alignItems: "center", position: "relative", height: 22 }}>
              <div
                style={{
                  position: "absolute",
                  left: 11,
                  right: 11,
                  top: 10,
                  borderTop: `2px dashed ${c["lava-muted"]}`,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                {shown.map((stop, i) => (
                  <div
                    key={`${stop}-${i}`}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: c.lava,
                      border: `4px solid ${c.calce}`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: c["lava-muted"] }}>
              {shown.map((stop, i) => (
                <div key={`${stop}-${i}`} style={{ display: "flex" }}>
                  {i === shown.length - 1 && more > 0 ? `${stop} +${more}` : stop}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: ogFamilies.display, fontWeight: 600, fontSize: 56, letterSpacing: -1 }}>Isula</div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: ogFamilies.display, data: display, weight: 600, style: "normal" },
        { name: ogFamilies.sans, data: sans, weight: 500, style: "normal" },
        { name: ogFamilies.sans, data: sansBold, weight: 600, style: "normal" },
      ],
    },
  );
}
