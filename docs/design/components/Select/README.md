# Select

Menu a tendina del sito. Sostituisce il `<select>` nativo in ogni form (pubblico, admin, filtri, carrello), perché il menu di sistema non segue i token. Implementazione: `src/components/design/select.tsx`, su `@base-ui/react/select`.

- Il trigger ha la forma dei campi del sito: 44 px di altezza (36 px con `size="sm"`), bordo `border-control` (non `divider`: il bordo di un controllo deve avere almeno 3:1 sullo sfondo), raggio `radius-md`, anello di focus `focus`. Con il menu aperto il bordo diventa `lava` e la freccia gira.
- Il popup è ancorato sotto il trigger, largo almeno quanto il trigger, con superficie `calce-raised`, ombra `shadow-lift` e raggio `radius-lg`. Opzioni alte 40 px; oltre circa otto opzioni la lista scorre.
- L'opzione evidenziata usa la tinta `coccio-tint`; quella scelta è in `coccio-text` con la spunta. Il colore non è l'unico segnale: la spunta c'è sempre.
- Un input nascosto con `name` porta il valore nelle form GET e nelle azioni server. `required` e `defaultValue` si comportano come sul nativo.
- Tastiera: frecce, Invio, Esc, digitazione per cercare. Animazione d'apertura da `movimento.md` (`dur-base`, solo opacità con movimento ridotto).
- Il nome accessibile è `label` (aria-label del trigger). Il testo visibile si scrive con `<label htmlFor={id}>`.
- Opzioni con `description` mostrano una riga secondaria; `options` accetta anche il nome del gruppo come descrizione (nel wrapper admin gli `<optgroup>` diventano così).
- Nei test e2e si usa `chooseOption(page, label, optionText)` da `e2e/helpers/controls.ts`.
