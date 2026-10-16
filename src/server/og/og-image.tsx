import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brandMark } from "@generated/design/brand";
import { ogColors as c, ogFamilies } from "@generated/design/og";
import { BRAND_NAME } from "@/lib/brand";

// Immagine di anteprima 1200×630 (schemi.md, "Condivisione"). Con una foto di copertina la foto
// sta a sinistra, a tutta altezza, e il testo su calce a destra; senza foto il testo occupa tutta
// la larghezza. Sotto, la linea del percorso con le tappe e il marchio con il nome. Colori e
// famiglie dai token (generated/design/og.ts); i font sono istanze statiche in assets/fonts (OFL),
// perché next/og non usa next/font né gli assi variabili: Fraunces 600 con SOFT 50 già applicato.

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";
// Scatola della foto nel layout con foto (la foto 4:5 viene ritagliata qui, vedi photo.ts).
export const ogPhotoBox = { width: 480, height: 630 };

const fontFile = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));

export async function ogImage({
  eyebrow,
  title,
  stops,
  photo = null,
}: {
  eyebrow: string;
  title: string;
  stops: string[];
  photo?: string | null;
}) {
  const [display, sans, sansBold] = await Promise.all([
    fontFile("Fraunces-SemiBold-Soft50.ttf"),
    fontFile("InstrumentSans-Medium.ttf"),
    fontFile("InstrumentSans-SemiBold.ttf"),
  ]);
  // Al massimo cinque tappe sulla linea, le altre si contano ("+3"); con la foto ce ne stanno tre.
  const maxStops = photo ? 3 : 5;
  const shown = stops.slice(0, maxStops);
  const more = stops.length - shown.length;
  const textWidth = photo ? 560 : 1000;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: c.calce,
          color: c.lava,
          fontFamily: ogFamilies.sans,
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={ogPhotoBox.width}
            height={ogPhotoBox.height}
            style={{ width: ogPhotoBox.width, height: ogPhotoBox.height, objectFit: "cover" }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
            padding: photo ? "56px 64px" : "64px 72px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: 2,
                color: c["coccio-text"],
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: ogFamilies.display,
                fontWeight: 600,
                fontSize: title.length > 40 ? 64 : 80,
                lineHeight: 1.05,
                letterSpacing: -1.5,
                maxWidth: textWidth,
              }}
            >
              {title}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {shown.length > 0 && (
              // Linea del percorso: punti lava su una linea tratteggiata, nomi delle tappe sotto.
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: textWidth }}>
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: photo ? 20 : 24,
                    color: c["lava-muted"],
                  }}
                >
                  {shown.map((stop, i) => (
                    <div key={`${stop}-${i}`} style={{ display: "flex" }}>
                      {i === shown.length - 1 && more > 0 ? `${stop} +${more}` : stop}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg width={48} height={48} viewBox={brandMark.viewBox}>
                <path fill={c.coccio} d={brandMark.body} />
                <path fill={c.coccio} d={brandMark.sun} />
              </svg>
              <div
                style={{
                  display: "flex",
                  fontFamily: ogFamilies.display,
                  fontWeight: 600,
                  fontSize: 52,
                  letterSpacing: -1,
                }}
              >
                {BRAND_NAME}
              </div>
            </div>
          </div>
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
