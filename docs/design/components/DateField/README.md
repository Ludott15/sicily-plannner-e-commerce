# DateField

Campo data con calendario mensile. Sostituisce `<input type="date">` nei form. Implementazione: `src/components/design/date-field.tsx`, calcoli puri in `calendar.ts` (con test unitari).

- Il campo ha la forma del componente `Select`. Mostra la data in formato lungo abbreviato, con Intl nella lingua corrente ("sab 24 ott 2026"); senza valore, il segnaposto.
- Il calendario è un popover ancorato al campo (sheet dal basso su mobile). La settimana inizia di lunedì; mesi e giorni vengono da Intl.
- Il valore è una stringa ISO `YYYY-MM-DD` in un input nascosto con `name`, come prima. Con `required` il controllo espone un input testuale nascosto, così la validazione del browser funziona e il focus torna al campo.
- `min` e `max` disabilitano le date fuori dall'intervallo (`aria-disabled`, non selezionabili). Le date si calcolano senza fusi orari: il calcolo usa i giorni dall'epoca in UTC.
- Tastiera secondo il pattern ARIA "date picker dialog": frecce per giorno e settimana, PagSu e PagGiù per il mese, Home e Fine per l'inizio e la fine della settimana, Invio o Spazio per scegliere, Esc per chiudere. Il focus torna al campo alla chiusura.
- Pulsanti "Oggi" (disabilitato fuori dai limiti) e "Cancella" (solo se il campo non è obbligatorio).
- Oggi si legge all'apertura del calendario, mai nel render: il calendario non è idratato chiuso.
- Nei test e2e si usa `pickDate(page, label, isoDate)` da `e2e/helpers/controls.ts`.
