# AffiliateOffer

L'offerta prenotabile di un partner affiliato: attività, noleggio auto, alloggio.

- **Sempre nominato il partner**, nel bottone e nella riga di trasparenza.
- **Fatti del partner** dall'API: voto e numero di recensioni, cancellazione (in `success` quando gratuita), data di aggiornamento del prezzo. Un fatto non disponibile si omette, non si inventa.
- **Stile secondario:** stesso peso visivo di "Aggiungi al viaggio" nella scheda, ma quella resta l'azione principale.
- Il click passa sempre da `/api/go/[id]`.
- Su mobile l'offerta principale compare anche nella barra fissa in basso ("Con guida da [€]").
