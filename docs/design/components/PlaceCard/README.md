# PlaceCard

Card di un luogo nel carosello "Dove andare in Sicilia" della home. Mostra il luogo come punto di partenza per il viaggio, non come elenco di attività.

- **Foto:** 4:5, sempre reale (copertina propria del luogo con kind "photo"). Mai illustrazioni: la sezione compare solo con almeno quattro luoghi con foto.
- **Area:** in etichetta sopra il nome (`text-label`, maiuscolo), nella lingua della pagina. Senza area, non compare.
- **Nome:** Fraunces, al massimo due righe (`line-clamp`), con il link esteso a tutta la card.
- **Frase breve** (`taglineIt`): al massimo 90 caratteri, sotto il nome. Se manca, non compare.
- **Link:** tutta la card porta a `/luoghi/[slug]` con un link esteso (`is-place__link::after`). Nessun controllo annidato nel link.
- **Carosello** (`FeaturedPlaces`): lista orizzontale con scroll-snap. Su mobile la card successiva sporge; da md ci sono due frecce da 44px con `aria-label`, disabilitate agli estremi. Nessuno scorrimento automatico. Con `prefers-reduced-motion` lo scorrimento è immediato.
- **Stati:** la sezione non compare se i luoghi in evidenza sono meno di quattro. Non ci sono stati di caricamento: la lista arriva dal server.

Classi in `src/components/design/isula.css` (prefisso `is-place`), solo token.
