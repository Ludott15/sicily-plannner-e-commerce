# ActivityCard

Card di un'attività del catalogo: foto 4:5, categoria, titolo, metadati, il perché del suggerimento, prezzo e azione.

- **Foto:** 4:5, reale; senza foto, segnaposto `calce-sunk` con il nome del luogo in Fraunces.
- **Titolo:** al massimo due righe, troncato con `line-clamp`, mai riscritto.
- **Metadati:** durata · mezzo · vincoli ("auto necessaria"). Massimo tre elementi.
- **Il perché** (`is-why`): "Per te" nei viaggi singoli, "Per il gruppo" con motivo aggregato e informativo ("Natura tra i primi interessi di 3 su 4") nei viaggi di gruppo; sotto i 3 membri solo il motivo logistico. Al massimo due motivi, che spiegano e non ripetono l'input: "Ami la natura · 20 min dalla base", non "Natura 5 su 5". Mai le preferenze di un singolo membro.
- **Prezzo:** solo se affiliabile ("guida da", "tour da"); un biglietto d'ingresso pagato in loco va nei metadati.
- **Azione:** "Aggiungi" (secondaria) nella card; la prenotazione avviene dalla scheda, tramite `AffiliateOffer`.
- Tutta la card porta alla scheda; salva (44px) e azione sono controlli separati.
