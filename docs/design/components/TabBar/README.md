# TabBar

Barra di navigazione inferiore su mobile: Esplora, Viaggi, Gruppi, Profilo (brief 6.1; "Shop" esce dalla barra finché la sua pagina non esiste).

- Etichette sempre visibili; voce attiva in `lava` con `aria-current="page"`, le altre in `lava-muted`.
- Altezza 56px più `env(safe-area-inset-bottom)`.
- Badge con il numero di articoli del carrello sulla voce Esplora (lo shop sta sotto Esplora); il carrello è anche nell'intestazione.
- La barra del chatbot, dove presente, sta sopra la TabBar. Nella scheda attività la TabBar è sostituita dalla barra di prenotazione.
