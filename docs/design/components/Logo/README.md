# Logo

Il marchio di Isula con il nome, come componente. Geometria e file del kit in [../../brand/logo/README.md](../../brand/logo/README.md).

- **Varianti:** `full` (marchio e nome in Fraunces 600, la dimensione segue il font-size del contenitore) e `mark` (solo il marchio, con l'etichetta accessibile).
- **Toni:** `color` (coccio, dai token come classi) e `mono` (un solo colore, quello del testo corrente).
- **Dove:** intestazione (sul link alla home, con l'etichetta "Isula, pagina iniziale"), piè di pagina (su `ink`, con il nome in `on-ink`), catalogo di sviluppo.
- **Accessibilità:** il marchio è decorativo nella variante `full` (`aria-hidden`), il nome è il testo del logotipo. Nella variante `mark` il contenitore ha `role="img"` e il nome come etichetta.
- **Dimensioni:** il marchio è alto 1,1 volte il font-size: si regola con `text-*` sul contenitore, non con attributi sull'SVG.
- **Non fare:** non ripetere il nome accanto al logo in un'altra etichetta; non usarlo come pulsante senza un link o un'etichetta.
