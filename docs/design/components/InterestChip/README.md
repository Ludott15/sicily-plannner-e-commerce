# InterestChip

Chip selezionabile per gli interessi dell'utente, nell'onboarding e nei filtri.

- `aria-pressed` porta lo stato; selezionato mostra sfondo tenue, bordo colorato e spunta.
- Colore di dominio: `is-chip--mare` per mare, natura, spostamenti; `is-chip--pistacchio` per cibo, vino e prodotti; nessuna variante per gli altri interessi, che da selezionati sono bordo `lava` su `calce-sunk`: neutri, non si confondono con un errore.
- Il colore non è mai l'unico segnale: la spunta indica la selezione anche senza distinguere i colori.
- Le etichette vengono dalla tabella `interests`: brevi, al massimo tre parole.
