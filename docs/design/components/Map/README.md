# Map

Mappa dei punti di un giorno o di una pagina: marker numerati come le tappe, una linea del percorso, attribuzione sempre visibile. Componente `TripMap` in `src/components/design/map/`.

- **Provider:** MapLibre GL JS (`maplibre-gl`) con lo stile base di OpenFreeMap (`liberty`). Nessuna chiave, nessun cookie. Attribuzione "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors" in un controllo non compatto, sempre leggibile.
- **Colori dai token:** i colori dello stile (acqua, terra, strade, etichette, linea del percorso) si leggono dalle variabili CSS del contenitore al montaggio e al cambio di tema (`data-theme` o preferenza di sistema). Nessun colore scritto nel codice.
- **Marker:** cerchio `lava` con il numero in `calce`, come il numero di tappa. Senza numero, un punto `coccio`. I marker sono nascosti allo screen reader: vale l'elenco numerato.
- **Linea del percorso:** una sola linea per giorno, tratteggiata in `lava-muted` (2px, tratti 2 e spazi 6, come nel manuale). Solo con `route`.
- **Vista:** `fitBounds` sui punti con margine, zoom massimo 13. Con `prefers-reduced-motion` il movimento è istantaneo. Senza punti, il centro della Sicilia.
- **Interazione:** lo scroll della pagina non si blocca. Lo zoom con la rotella richiede Ctrl (o Cmd); su touch servono due dita per spostare la mappa. Controlli di zoom con etichette.
- **Caricamento:** il canvas si monta solo quando il riquadro entra nello schermo (IntersectionObserver, con 200 px di anticipo). Il codice di MapLibre e il suo CSS sono in un import dinamico: non entrano nel bundle iniziale. Finché non si vede, nessuna richiesta al provider.
- **Altezza fissa:** 300 px su mobile, 360 px da 768 px in su. Il riquadro c'è anche prima del caricamento, quindi nessun salto di layout.
- **Elenco numerato:** sempre nel DOM. Finché la mappa non è pronta copre il riquadro (è il fallback se il provider non risponde o se JavaScript non c'è); a mappa pronta resta per gli screen reader. Con `listed={false}` non c'è elenco: la pagina mette i propri link.
- **Stampa:** il canvas non si stampa; resta l'elenco numerato. Nelle pagine con più giorni in stampa, la mappa si stampa solo dove è dichiarata (`is-map-printable`).
- **Errore:** se il provider non risponde prima del primo caricamento, il riquadro dice che la mappa non è disponibile e l'elenco resta.
- **Tema:** segue il tema del sottoalbero (vedi `data-theme`), come gli altri componenti.
- **Posizione:** su desktop una colonna laterale accanto all'elenco delle tappe (sticky); su mobile un `<details>` "Mostra la mappa" chiuso di default, sotto le pillole dei giorni.

## Props

| Prop | Tipo | Note |
| --- | --- | --- |
| `points` | `{ id: string; lat: number; lng: number; label: string; number?: number }[]` | Con `number` il marker è numerato. Il riferimento cambia solo quando cambia il contenuto. |
| `route` | `boolean` | Linea tra i punti nell'ordine dato. Predefinito `false`. |
| `ariaLabel` | `string` | Nome della sezione (obbligatorio). |
| `listed` | `boolean` | Elenco numerato dei punti. Predefinito `true`. |
| `className` | `string` | Classe di utilità sullo stesso elemento: vince sul componente. |

## Attenzione

- Un punto senza `lat` o `lng` non si disegna: la tappa resta nell'elenco della pagina, senza marker.
- Il numero del marker è quello della tappa nel giorno, anche se una tappa precedente non ha coordinate.
