# Design di Isula: guida per lo sviluppo

Questa cartella contiene il design system e i mockup di riferimento. "Isula" è un nome di lavoro.

## Cosa c'è e quanto vale

| Percorso | Cosa | Autorità |
| --- | --- | --- |
| `tokens.json` | Colori (tema chiaro e scuro), tipografia, spaziature, raggi, ombre, durate, curve | **Fonte unica.** Nessun valore scritto a mano nel codice |
| `brand/manuale.md` | Promessa, voce, regole su colore, tipografia, voce locale, accessibilità | Vincolante |
| `brand/movimento.md` | Animazioni, durate, movimento ridotto | Vincolante |
| `brand/schemi.md` | Stati, fiducia, affiliati, prenotazioni, browser interni, navigazione mobile, gamification | Vincolante |
| `components/*/README.md` | Regole di ogni componente | Vincolante |
| `components/riferimento.css` e `anteprima.html` | Implementazione di riferimento in CSS semplice | Riferimento: da riscrivere come componenti React |
| `mockups/*.html` | Home, scheda attività, itinerario di gruppo (desktop); home, itinerario pronto, scheda attività, onboarding, itinerario di gruppo (mobile) | Riferimento per struttura, gerarchia e contenuti; stili scritti inline, non da copiare |
| `BACKLOG.md` | Lavoro di design e contenuti rimandato | Da pianificare |

## Regole per l'implementazione

1. **I token diventano variabili CSS generate** da `tokens.json` con uno script (`--calce`, `--coccio-text`, `--space-4`, `--radius-lg`…): tema chiaro in `:root`, tema scuro in `[data-theme="dark"]` e in `prefers-color-scheme: dark`. Un valore `"{nome}"` è un alias: diventa `var(--nome)`. Tailwind legge le stesse variabili; nessun colore esadecimale nei componenti.
2. **Font con `next/font/google`**: Fraunces (assi `opsz` e `SOFT`, peso 600) e Instrument Sans. L'ottimizzazione con istanza fissa è nel backlog.
3. **I mockup non sono codice da copiare.** I testi tra parentesi quadre (`[€]`, `[Partner]`, `[Foto]`) sono contenuti reali ancora da scrivere: nell'interfaccia vengono dal database, mai inventati.
4. **Regole di prodotto che toccano il codice:**
   - Il chatbot rispetta le parole vietate del manuale (sezione Voce e contenuti).
   - Ogni link affiliato nomina il partner e mostra la riga di trasparenza.
   - Motivi "Per il gruppo" solo aggregati; sotto i 3 membri solo il motivo logistico.
   - Consigli locali solo da autori reali o dalla redazione, con data di verifica; scadenza a 12 mesi.
   - Recensioni con l'etichetta "Recensione con premio".
   - Accesso e salvataggio pensati per i browser interni di TikTok e Instagram (vedi `brand/schemi.md`).
