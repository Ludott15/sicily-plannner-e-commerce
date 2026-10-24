# Popover

Superficie unica delle finestre che si aprono dall'intestazione: carrello. Implementazione: `src/components/design/popover.tsx`, su `@base-ui/react/popover`. Il menu Esplora e il menu avatar usano la stessa superficie (classe `is-panel`), ma restano su `ActionMenu` perché hanno già la navigazione a frecce del menu ARIA.

- Desktop (da 768 px): pannello ancorato al suo pulsante, allineato al bordo destro (`align="end"`), largo 400 px al massimo. Titolo, contenuto che scorre, piede con le azioni.
- Mobile (sotto 768 px): sheet dal basso con maniglia e bordi arrotondati in alto, rispettando `env(safe-area-inset-bottom)`.
- Si chiude con Esc, con il clic fuori e con il pulsante ×. Il focus resta nel pannello (`modal="trap-focus"`) e torna al pulsante alla chiusura.
- Il piede riceve `close` per le azioni che chiudono il pannello ("Continua"). Il carrello vuoto non ha piede: ha l'icona, il testo e il link allo shop.
- Il pulsante con sola icona ha `triggerLabel` come nome accessibile.
- Le finestre del sito che sono moduli di ricerca (`SiteSearch`, combobox ARIA 1.2) restano inline: il focus deve rimanere nel campo, quindi usano la superficie `is-panel` senza il Popover.
