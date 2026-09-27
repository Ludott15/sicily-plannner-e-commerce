# Movimento

Il movimento di Isula è una passeggiata, non uno spettacolo: accompagna, conferma, poi si ferma. Serve a tre cose sole: far capire da dove arriva un elemento, confermare un'azione, celebrare un traguardo. Tutto il resto sta fermo.

## Token

| Token | Valore | Quando |
| --- | --- | --- |
| `dur-fast` | 140ms | Hover, chip, focus |
| `dur-base` | 240ms | Pannelli, pagine, comparsa di card |
| `dur-slow` | 420ms | Timbro, conteggio punti |
| `dur-route` | 900ms | Linea del percorso |
| `ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | Default |
| `ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Linea del percorso, cambi di stato |
| `ease-stamp` | cubic-bezier(0.34, 1.56, 0.64, 1) | Solo timbro dei badge |

Si animano solo `transform`, `opacity` e `clip-path`: mai larghezze, altezze o margini.

**Come si implementa la linea del percorso.** Una sola linea per giorno, disegnata sul contenitore della lista (`ol`), non un pezzo per tappa. Si scopre animando `clip-path` da `inset(0 0 100% 0)` a `inset(0)`. Il ritardo di comparsa di ogni punto si calcola in JavaScript come `offsetTop` del punto diviso l'altezza della lista, moltiplicato per la durata. Nelle mappe la linea è un `path` SVG animato con `stroke-dashoffset`.

## Schemi

| Momento | Animazione |
| --- | --- |
| Entrata di pagina | Contenuto da opacità 0 e 8px più in basso a posizione finale, `dur-base` `ease-out`. Le card di una griglia entrano in sequenza, 40ms l'una, al massimo 6. |
| Hover di una card | Sale di 2px, ombra da `shadow-card` a `shadow-lift`, l'immagine si ingrandisce del 3% dentro il suo riquadro, `dur-fast`. |
| Chip di interesse | Sfondo e bordo passano allo stato scelto in `dur-fast`; la spunta entra con scala da 0.6 a 1. |
| Scala di preferenza | Il riempimento dei punti avanza da sinistra, 30ms per punto. |
| Apertura di un itinerario | Solo alla prima apertura: la linea del percorso si scopre dall'alto in basso in `dur-route` `ease-in-out`; ogni punto compare quando la linea lo raggiunge. Al cambio di giorno la linea è già disegnata. |
| Aggiunta di una tappa | La nuova tappa si apre dall'alto con opacità, `dur-base`; la linea si allunga fino al nuovo punto. |
| Voto nel gruppo | Il contatore cambia con uno scorrimento verticale di 6px, `dur-fast`. |
| Punti guadagnati | La pillola punti conta dal vecchio al nuovo valore in `dur-slow`; un "+20" in `zagara-tint` sale di 12px e svanisce. |
| Badge sbloccato | Il timbro entra da scala 1.3 e rotazione -12° a scala 1 e -4°, `dur-slow` `ease-stamp`; nessun suono, nessun coriandolo. |
| Chatbot che risponde | Tre punti `lava-muted` che pulsano in opacità, sfasati di 160ms. Le schede delle attività suggerite entrano come le card di una griglia. |
| Caricamento | Blocchi `calce-sunk` con la forma del contenuto, opacità che oscilla tra 1 e 0.6 ogni 1.2s. Niente spinner, niente shimmer luccicante. |
| Aggiunta al carrello | Il contatore del carrello cresce a scala 1.2 e torna a 1, `dur-base` `ease-stamp`. |

## Movimento ridotto

Con `prefers-reduced-motion: reduce`: niente spostamenti né rotazioni, solo dissolvenze di `dur-fast`. La linea del percorso compare già disegnata, i punti non contano ma mostrano subito il valore finale, il timbro appare senza rotazione.
