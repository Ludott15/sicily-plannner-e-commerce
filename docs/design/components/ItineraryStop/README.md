# ItineraryStop

Una tappa dell'itinerario dentro una lista `is-route`: orario, punto sulla linea del percorso, contenuto.

- **Linea del percorso:** una sola per giorno, disegnata dalla lista (`is-route::before`), non un pezzo per tappa. Va dal centro del primo punto al centro dell'ultimo, mai oltre: le due posizioni dipendono dall'altezza delle card e si misurano in JavaScript (`--route-start`, `--route-end`). `is-route--draw` la scopre alla prima apertura; al cambio di giorno si omette.
- **Punto:** `lava` per le tappe, `coccio` per la tappa in corso (`is-stop--now`) durante il viaggio.
- **Trasferimento** (`is-stop--transfer`): punto vuoto `mare`, solo mezzo, durata e distanza.
- **Voti** (solo nei viaggi di gruppo): due `VoteButton` con icona e numero, sempre presenti su ogni tappa. Il proprio voto è `aria-pressed`.
- **Il perché:** "Per il gruppo" con motivo aggregato e informativo, che non ripete i voti; sotto i 3 membri solo il motivo logistico. Mai le preferenze dei singoli.
- **Colonna dell'orario:** larghezza nella variabile `--stop-time-w` della lista; la linea del percorso si allinea da sola.
- Meta troncata a due righe. Riordino trascinando la card, non il punto.
