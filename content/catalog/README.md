# Catalogo dei contenuti

Testi dei luoghi, delle attività e degli itinerari pronti. Il sito li mostra; `fonti` e `note` non
escono mai nelle pagine.

## File

- `luoghi.json`: slug, `tagline_it` (massimo 70 caratteri), `description_it` (280-600), `consigli` (1-2, 120-260 ciascuno), `fonti` (1-3 URL https), `note`.
- `attivita.json`: slug, `title_it` (massimo 70), `title_en`, `description_it` (300-700), `consigli` (esattamente 2), `fonti`, `note`.
- `itinerari.json`: slug, `title_it`, `subtitle_it` (massimo 90), `description_it` (300-700), `day_intros` (una per giorno, massimo 240), `day_notes` (una per giorno, massimo 260), `consigli` (2-3, massimo 260), `fonti`, `note`. Il numero dei giorni è quello del database: il file e il database devono coincidere.
- `DA-VERIFICARE.md`: le note dei redattori e le decisioni da confermare. È l'elenco per Ludovico.

## Regole di verità

- Solo fatti verificati con fonti ufficiali o affidabili. Niente orari, prezzi, telefoni o nomi di locali e aziende che possono cambiare.
- I consigli sono firmati "Redazione di Isula" e scritti in forma di `tu`.
- Gli slug sono quelli dei luoghi e delle attività nel database, senza prefisso. Il prefisso `demo-` si aggiunge in locale con `--slug-prefix=demo-`.

## Import

```sh
npm run content:catalog -- --dry-run                  # piano, nulla viene scritto
npm run content:catalog                                # scrive; chiede conferma verso un host non locale
npm run content:catalog -- --slug-prefix=demo- --yes   # solo locale: aggiorna i dati demo
```

L'import aggiorna le righe esistenti per slug e non crea luoghi né attività che mancano: li elenca nel
riepilogo. I consigli diventano `local_tips` firmati dall'autore editoriale "Redazione di Isula"
(creato se manca). Una seconda esecuzione non inserisce nulla; un consiglio tolto dal file viene
disattivato, senza toccare i consigli di persone. Il `verified_at` dei consigli nuovi è oggi, o quello
di `--verified-at=AAAA-MM-GG`.

Il seed (`supabase/seed.sql`) contiene gli stessi testi: `scripts/content/catalog-seed.test.ts` verifica che coincidano.
