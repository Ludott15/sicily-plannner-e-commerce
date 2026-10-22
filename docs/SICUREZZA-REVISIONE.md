# Revisione di sicurezza (passo 11.5)

Data: 2026-10-21. Ambiti: autenticazione, RLS, webhook Stripe, redirect, upload.

Metodo: lettura del codice dei percorsi sensibili e interrogazione in sola lettura del database locale (funzioni `SECURITY DEFINER`, policy, grant, viste). Nessuna prova d'attacco contro ambienti reali. Le correzioni ai difetti confermati vanno in PR separate, come da passo 11.5.

## Esito

Negli ambiti rivisti non emergono attacchi sfruttabili confermati. Un difetto confermato, di gravità media, era nel proxy: il suo matcher escludeva quasi ogni percorso, quindi su nessuna pagina girava il proxy (né il rinnovo della sessione Supabase né gli header di sicurezza). È corretto in questa PR, con il test e2e degli header. Le altre osservazioni sono di gravità bassa, informative, o riguardano la configurazione di produzione.

## Controlli eseguiti senza difetti

| Area | Controllo | Esito | Dove |
| --- | --- | --- | --- |
| Autenticazione | Identità verificata con `getUser()`; nessuna decisione sul solo `getSession()` (zero occorrenze in `src`) | ok | `src/server/auth/index.ts` |
| Autenticazione | `requireAdmin` risponde 404 e legge il ruolo dal profilo tramite RLS | ok | `src/server/auth/index.ts` |
| Autenticazione | Callback di magic link e OAuth: `next` validato con `safeNextPath` | ok | `src/app/api/auth/callback/route.ts` |
| RLS | Tutte le tabelle di `public` hanno la RLS attiva | ok | `pg_class.relrowsecurity` (nessuna eccezione) |
| RLS | 78 funzioni `SECURITY DEFINER` in `public`: tutte con `search_path` fissato | ok | `pg_proc.proconfig` |
| RLS | Policy con `qual = true` solo su tabelle di riferimento pubblico (`areas`, `area_drive_times`, `badges`, `interests`, `place_legs`, `point_rules`) | ok | `pg_policies` |
| RLS | Ordini, notifiche, log admin, eventi Stripe, segnalazioni e ricerche senza esito: leggibili solo dal titolare o dall'admin | ok | `pg_policies` |
| RLS | Viste con `security_barrier` o `security_invoker`; `public_reviews` e `public_local_tips` escludono i nascosti e gli inattivi; `leaderboard_season_totals` non ha grant ad `anon` né `authenticated` | ok | `pg_class.reloptions`, `information_schema.role_table_grants` |
| Webhook Stripe | Firma verificata sul corpo grezzo; `livemode` confrontato con la chiave; 400 su firma assente o errata; 500 con retry su errore di elaborazione | ok | `src/app/api/stripe/webhook/route.ts` |
| Redirect | `safeNextPath` accetta solo percorsi interni, anche con `//` e `/\` (test in `redirect.test.ts`) | ok | `src/server/auth/redirect.ts` |
| Redirect | `/api/go/[id]`, `/api/go/v`, `/api/go/flight`: destinazione dal catalogo o da link firmato, host fisso; nessun parametro della richiesta diventa URL | ok | `src/app/api/go/*`, `src/server/flights/links.ts` |
| Upload | Caricamento dei media solo per l'admin; dimensione massima 10 MB; tipo controllato; percorso `incoming/` con UUID | ok | `src/server/media/admin-actions.admin.ts`, `src/lib/media.ts` |
| Upload | Storage: insert, update e delete del bucket `media` solo per l'admin; `/api/media` serve le varianti pubbliche e gli originali solo a sessioni admin; gli SVG sono serviti con `sandbox` | ok | `supabase/migrations/20261006141804_media_rls_storage.sql`, `src/app/api/media/[...path]/route.ts` |
| XSS | JSON-LD con `<` escapato; il Markdown del sito non passa HTML grezzo né `dangerouslySetInnerHTML` | ok | `src/lib/seo.ts`, `src/components/editorial/markdown.tsx` |
| Segreti | Nessun riferimento alla chiave segreta di Supabase in `src`; nessun segreto con prefisso `NEXT_PUBLIC_` | ok | ricerca nel codice |

## Difetto corretto in questa PR

| Gravità | Difetto | File | Correzione |
| --- | --- | --- | --- |
| Media | Il matcher di `src/proxy.ts` escludeva, con l'espressione di esclusione per api, _next, _vercel e i percorsi con un punto, quasi ogni percorso. Nella stringa JavaScript il punto dell'esclusione era scritto con un solo backslash, che viene perso: restava solo `.`, quindi l'esclusione valeva per qualunque percorso di almeno due caratteri. Il proxy girava solo sulla home. Ne derivavano: nessun header di sicurezza sulle pagine, nessun rinnovo della sessione Supabase nel proxy, nessun nonce. | `src/proxy.ts` | Il punto è scritto con il backslash doppio nel codice. Test: `e2e/security-headers.spec.ts` controlla gli header e il nonce della pagina. |

## Osservazioni (non corrette in questa PR)

| Gravità | Osservazione | File | Proposta |
| --- | --- | --- | --- |
| Alta (dipendenza) | `next` 16.3.6 è nell'intervallo di alcuni avvisi di gravità alta: cache poisoning di SSG/ISR per installazioni self-hosted, SSRF in Image Optimization, contenuto di Draft Mode in `use cache`, divulgazione nell'endpoint MCP di sviluppo. Il sito non usa `remotePatterns` né Draft Mode; l'impatto reale va verificato sulla versione corretta. | `package.json`, `next.config.ts` | PR separata che porta Next alla versione corretta, con CI verde. Non è un intervento da fare dentro il passo 11.5. |
| Bassa (configurazione) | Senza `RATE_LIMIT_SECRET` (né `AFFILIATE_LINK_SECRET`), i click su `/api/go/*` non sono limitati: `allowGoClick` restituisce `true`. Gli altri limiti del passo 11.5 negano in produzione. | `src/server/affiliates/rate-limit.ts` | Già coperto da LANCIO 12.1: la chiave è obbligatoria in produzione. Rendere il rifiuto automatico cambierebbe il comportamento dei click affiliati: da decidere con il titolare. |
| Bassa | Gli header di sicurezza del proxy non coprono le risposte di `/api/*` (il matcher le esclude). Le risposte sono JSON con `Content-Type` esplicito, quindi il rischio concreto è basso. | `src/proxy.ts` | Aggiungere `X-Content-Type-Options: nosniff` alle route `/api/:path*` in `next.config.ts` (`headers()`). |
| Bassa | `hit_rate_limit` è eseguibile da `anon` e `authenticated`, come da grant del passo 3.1. Chiunque può far avanzare un contatore, ma i bucket sono HMAC con chiave segreta e non si possono scegliere. | `supabase/migrations/20261014174139_affiliati_funzioni.sql` | Nessuna per ora. Se in futuro la chiave non fosse più segreta, restringere il grant alle sole funzioni server. |
| Informativa | `public_reviews` espone nome visibile e avatar dell'autore della recensione. È una scelta di prodotto, da confermare con il testo dell'informativa sulle recensioni. | `supabase/migrations/` (vista `public_reviews`) | Verificare l'informativa prima del lancio. |
| Informativa | Dipendenze di sviluppo con avvisi: `vite`, `hono`, `braces`, `source-map-js`, `@modelcontextprotocol/sdk`, `esbuild` annidato in `drizzle-kit` (gravità moderata). | `package.json` | Dependabot (passo 11.5) apre le PR. Vedi LANCIO 12.5. |

## Limiti noti degli header

- La CSP usa un nonce per script e stili di elemento. Gli attributi `style=""` che React scrive nel markup non hanno nonce: per loro la CSP ammette `style-src-attr 'unsafe-inline'`. È un compromesso documentato, che non apre l'esecuzione di script.
- In sviluppo la CSP aggiunge `'unsafe-eval'` e le connessioni HMR; in produzione no. HSTS è solo su Vercel in produzione.
- Il nonce richiede il rendering dinamico: il layout `src/app/[locale]/layout.tsx` chiama `connection()`. Prima di questa PR le pagine venivano prerenderizzate e non ricevevano la CSP. Il costo è che le pagine pubbliche non sono più statiche: va misurato dopo il lancio (Vercel, tempo di risposta della home e del catalogo).
