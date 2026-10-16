# Logo di Isula: kit

Il marchio è un'isola (triangolo con gli angoli arrotondati) con il sole sopra, staccato. Il logotipo è il marchio accanto alla parola **Isula** in Fraunces 600, colore `lava`.

## File

| File | Uso |
| --- | --- |
| `mark.svg` | Marchio in `coccio`. Favicon, social, uso generale. |
| `mark-mono.svg` | Marchio in `lava`, per sfondi chiari. |
| `mark-mono-on-dark.svg` | Marchio in `calce`, per sfondi scuri (footer, tema scuro). |
| `logo-horizontal.svg` | Logotipo orizzontale su sfondo chiaro. |
| `logo-horizontal-on-dark.svg` | Logotipo orizzontale su sfondo scuro. |
| `mark.json` | Geometria: l'unica fonte del marchio. Modificarla e poi `npm run design:brand`. |

I file si generano da `mark.json` e da `docs/design/tokens.json` con `npm run design:brand`. Non si modificano a mano: `npm run design:check` (in CI) segnala quelli non aggiornati.

## Regole d'uso

- **Area di rispetto:** almeno un quarto dell'altezza del marchio su ogni lato.
- **Dimensione minima:** il marchio da 16 px; il logotipo orizzontale da 120 px di larghezza. Sotto i 16 px il sole diventa un puntino: non si usa il marchio.
- **Colori:** `coccio` per il marchio pieno; `lava` o `calce` nel monocromatico, a seconda dello sfondo. Sull'icona dell'app il marchio è `calce` su `coccio`.
- **Sfondi:** il marchio pieno su `calce`, `calce-raised` o `coccio-tint`. Su sfondi scuri (`ink`, tema scuro) il monocromatico `mark-mono-on-dark.svg`.
- **Non fare:** ruotare, allungare o deformare il marchio; cambiarne i colori; mettere ombre o contorni; aggiungere testo o simboli dentro il marchio; usarlo come sfondo di un testo; scriverlo a mano in hex.

## Dove vive nel sito

- Componente `Logo` (`src/components/design/logo.tsx`): header, footer, catalogo `/it/dev/design`.
- Favicon `src/app/icon.svg`, icona Apple `src/app/apple-icon.tsx`, icone PWA `/icons/icon-192.png` e `/icons/icon-512.png`, manifest `src/app/manifest.ts`.
- Anteprime social e immagine verticale: `src/server/og/`, con il marchio dalla stessa geometria (`generated/design/brand.ts`).
