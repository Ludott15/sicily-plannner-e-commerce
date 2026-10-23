# Logo di Isula: kit

Il marchio è una piastrella di maiolica siciliana (quadrato con gli angoli appena arrotondati, colore `coccio`) con una rosetta a tre petali in `calce` al centro: il motivo di Caltagirone e Santo Stefano di Camastra, con la simmetria a 120° che richiama i tre capi della Sicilia. Il logotipo è il marchio accanto alla parola **Isula** in Fraunces 600, colore `lava`.

## File

| File | Uso |
| --- | --- |
| `mark.svg` | Marchio a colori: piastrella `coccio`, rosetta `calce`. Uso generale. |
| `mark-mono.svg` | Monocromatico in `lava`, per sfondi chiari: la rosetta è un foro. |
| `mark-mono-on-dark.svg` | Monocromatico in `calce`, per sfondi scuri (footer, tema scuro). |
| `app-icon.svg` | Icona dell'app: piastrella a tutto campo, rosetta più grande. |
| `logo-horizontal.svg` | Logotipo orizzontale su sfondo chiaro. |
| `logo-horizontal-on-dark.svg` | Logotipo orizzontale su sfondo scuro. |
| `mark.json` | Geometria: l'unica fonte del marchio. Modificarla e poi `npm run design:brand`. |

I file si generano da `mark.json` e da `docs/design/tokens.json` con `npm run design:brand`. Non si modificano a mano: `npm run design:check` (in CI) segnala quelli non aggiornati.

## Regole d'uso

- **Area di rispetto:** almeno un quarto dell'altezza del marchio su ogni lato.
- **Dimensione minima:** il marchio da 16 px; il logotipo orizzontale da 120 px di larghezza. A 16 px la rosetta resta riconoscibile come tre braccia (verificato sull'anteprima); sotto i 16 px il marchio non si usa.
- **Colori:** `coccio` per la piastrella e `calce` per la rosetta. Nel monocromatico il marchio è un solo colore, `lava` o `calce` a seconda dello sfondo: la rosetta è il fondo che si vede attraverso la piastrella.
- **Sfondi:** il marchio pieno su `calce`, `calce-raised` o `coccio-tint`. Su sfondi scuri (`ink`, tema scuro) il monocromatico `mark-mono-on-dark.svg`.
- **Non fare:** ruotare, allungare o deformare il marchio; cambiarne i colori; mettere ombre o contorni; aggiungere testo o simboli dentro il marchio; usarlo come sfondo di un testo; scriverlo a mano in hex.

## Semplificazioni per le dimensioni piccole

- Niente quarti di cerchio agli angoli della piastrella: a 16 px sarebbero rumore e a 32 px competerebbero con i petali. Un solo disegno per tutte le dimensioni, nessuna variante da favicon.
- La rosetta è un'unica forma connessa (disco centrale e tre lame curve), senza fori né bordi sottili: il foro centrale, previsto come opzione per le dimensioni grandi, non è stato aggiunto.

## Dove vive nel sito

- Componente `Logo` (`src/components/design/logo.tsx`): header, footer, catalogo `/it/dev/design`.
- Favicon `src/app/icon.svg`, icona Apple `src/app/apple-icon.tsx`, icone PWA `/icons/icon-192.png` e `/icons/icon-512.png`, manifest `src/app/manifest.ts`.
- Anteprime social e immagine verticale: `src/server/og/`, con il marchio dalla stessa geometria (`generated/design/brand.ts`).
