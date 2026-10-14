# FlightSearch

Il modulo di ricerca dei voli verso la Sicilia: partenza, arrivo, date, persone. Compare in due varianti.

- **Compact:** sotto l'hero della home, nella barra delle proposte e nelle pagine di coppia `/voli/[coppia]`. Stesso modulo, bottone secondario (la home ha già l'azione principale).
- **Full:** la pagina `/voli`, con il tipo di viaggio in evidenza, lo scambio e le spiegazioni. Il bottone "Cerca voli" è principale.

Regole:

- **Partenza come combobox:** campo di testo con elenco di aeroporti (città, nome o codice, senza accenti né maiuscole). Frecce per scorrere, Invio per scegliere, Esc per chiudere. Il campo dichiara l'elenco con `aria-activedescendant`.
- **Partenza siciliana:** un aeroporto siciliano non è una partenza. Se l'utente lo scrive, il modulo lo dice e non cerca.
- **Arrivo:** uno dei sei aeroporti siciliani (CTA, PMO, TPS, CIY, LMP, PNL). Predefinito CTA, o quello scelto nel profilo.
- **Scambia:** visibile ma disabilitato, con la spiegazione accanto: l'arrivo è sempre in Sicilia. Solo nella variante full.
- **Andata o andata e ritorno:** con andata e ritorno compare la data di ritorno, che non può essere prima dell'andata.
- **Persone:** da 1 a 9.
- **Invio:** porta a `/voli?da=…&a=…&andata=…&ritorno=…&persone=…`. Lo stato sta nell'URL, quindi la ricerca si condivide. I prezzi li calcola la pagina sul server; il componente non chiama nessun servizio.
- **Errori:** messaggi sotto il campo, collegati con `aria-describedby` e `aria-invalid`.
- **Stato in attesa:** il bottone si disabilita e dice "Cerco i voli…" mentre la navigazione parte.
- **Da un viaggio:** con un viaggio aperto (chip "Voli" della checklist) la data e le persone arrivano dal viaggio e lo dice la riga sotto il modulo.
- Solo token del design system, nessun colore o font scritto a mano. Testi in `messages/*.json`, namespace `Flights`.
