# BookingList

La checklist "Da prenotare" dell'itinerario: ogni voce con casella, partner e link al partner.

- Lo stato lo segna l'utente con la casella da 44px (`role="checkbox"`): non riceviamo conferme dai partner.
- Una voce segnata diventa barrata in `lava-muted` e perde il bottone verso il partner.
- Conteggio sempre nella forma "3 da prenotare · 1 fatto", identico in intestazione, bottone e lista.
- Riga di trasparenza sugli affiliati sotto la lista.
- Una voce con `searchAction` (es. voli: la ricerca di `/voli` con date e persone del viaggio) mostra un bottone verso la pagina del sito al posto del bottone del partner; la riga del partner resta solo se il partner è noto.
