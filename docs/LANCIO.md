# Lancio: configurazione di produzione

Passi da fare una volta, nell'ordine indicato, sul progetto Supabase di produzione, su Resend, sul DNS del dominio e su Vercel. Per ogni passo è indicato come verificarlo. Il controllo automatico finale è `PRE_LAUNCH=1`, che si lancia a mano e mai in CI.

## Come funziona la configurazione di Supabase Auth

`supabase/config.toml` contiene la configurazione locale più il blocco `[remotes.production]`. La CLI fonde quel blocco sopra la base solo se il suo `project_id` coincide con il progetto collegato. L'ho verificato nel sorgente della CLI, `apps/cli-go/pkg/config`.

`supabase config push` invia queste proprietà:
- `site_url` e i redirect;
- gli accessi anonimi;
- il CAPTCHA;
- "Confirm email" (`mailer_autoconfirm = !enable_confirmations`);
- i template email (da `content_path`);
- l'SMTP;
- i limiti di invio.

Le regole del blocco:
- **Nessun valore locale.** `site_url` e `additional_redirect_urls` vengono dal dominio, tramite `env()`.
- **Nessun segreto nel file.** Segreto di Turnstile, chiave di Resend e mittente arrivano da `env()` al momento del push.
- **Le regole sono controllate in CI** da `scripts/supabase/production-config.test.ts`: nessun `localhost`, nessun `http://`, nessuna chiave di prova di Cloudflare, segreti solo da `env()`, conferme email attive, SMTP attivo, limite di invio adeguato.

**Mai `supabase config push` direttamente.** Si usa `npm run supabase:push-production`, che si ferma se:
- `project_id` è ancora il segnaposto (`xxxxxxxxxxxxxxxxxxxx`) o non coincide con il progetto collegato. Con il segnaposto la CLI ignorerebbe il blocco e spingerebbe i valori locali;
- manca una variabile letta con `env()`. Le controlla tutte: quelle del blocco e quelle dei provider attivi ereditati dalla base, come Google. Senza, la CLI spingerebbe il testo `env(NOME)`;
- una variabile ha un valore locale o è una chiave di prova.

## Ordine dei passi

### 0. Prima del lancio (una volta)

1. **Progetto Supabase di produzione.** Crealo e annota il ref (20 lettere minuscole, nella URL della dashboard). In `supabase/config.toml` sostituisci il segnaposto di `[remotes.production] project_id` con il ref, e committa la modifica in una PR.
2. **Migrazioni.** `npx supabase link --project-ref <ref>` e poi `npx supabase db push`, **senza** `--include-seed`: il seed contiene solo dati demo.
3. **Resend, dominio di invio.** Su resend.com aggiungi il dominio (consigliato un sottodominio dedicato, es. `mail.<dominio>`). Resend mostra i record DNS da creare; copiali esattamente come li mostra:
   - **SPF:** un record TXT `v=spf1 include:… ~all` e un record MX per il sottodominio di ritorno;
   - **DKIM:** un record TXT `resend._domainkey…` con la chiave pubblica;
   - **DMARC (consigliato):** TXT `_dmarc.<dominio>` con almeno `v=DMARC1; p=none; rua=mailto:<tuo indirizzo>`, da stringere dopo le prime settimane.

   **Verifica:** su Resend lo stato del dominio è "Verified", e un'email di prova arriva in posta in arrivo, non nello spam, con SPF e DKIM "pass" nelle intestazioni.
4. **Resend, chiave API.** Crea una chiave con permesso "Sending access", limitata al dominio. È `RESEND_API_KEY`.
5. **Cloudflare Turnstile.** Turnstile → Add widget, con il dominio di produzione e modalità "Managed". Ne escono la site key (va su Vercel) e la chiave segreta (`SUPABASE_AUTH_CAPTCHA_SECRET`).
6. **Google OAuth** (se resta attivo): client OAuth su Google Cloud con redirect `https://<ref>.supabase.co/auth/v1/callback`. Ne escono `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` e `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.

### 1. `supabase link`

```bash
npx supabase link --project-ref <ref>
```

**Verifica:** `supabase/.temp/project-ref` contiene il ref, lo stesso scritto in `[remotes.production]`.

### 2. Segreti nell'ambiente della shell (mai nel file, mai committati)

```bash
export PRODUCTION_SITE_URL="https://<dominio>"
export PRODUCTION_AUTH_CALLBACK_URL="https://<dominio>/api/auth/callback"
export SUPABASE_AUTH_CAPTCHA_SECRET="<chiave segreta Turnstile>"
export RESEND_API_KEY="<chiave Resend>"
export SMTP_SENDER_EMAIL="accesso@mail.<dominio>"   # indirizzo del dominio verificato su Resend
export SMTP_SENDER_NAME="Isula"
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="<client id>"
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="<client secret>"
```

### 3. `config push`

```bash
npm run supabase:push-production -- --diff   # solo le differenze: leggile tutte
npm run supabase:push-production             # la CLI chiede conferma per ogni risorsa
```

**Verifica:** il diff cambia solo le voci attese, e lo script non si ferma con "Push verso produzione bloccato".

### 4. Segreti su Vercel (Production)

| Variabile | Valore | Verifica |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio>` | canonical e sitemap usano il dominio |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dal progetto di produzione | il sito legge il catalogo |
| `DATABASE_URL` | pooler in modalità transaction (porta 6543); `DATABASE_PREPARED_STATEMENTS=false` | le pagine si aprono senza errori |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key del widget | se manca, la build di produzione si ferma (`src/lib/env.ts`); il widget non mostra "testing only" |
| `CRON_SECRET` | stringa casuale lunga (`openssl rand -hex 32`) | `GET /api/cron/cleanup-guests` senza header risponde 401; nei log il cron delle 3:00 UTC risponde 200 |

Poi un nuovo deploy di produzione.

### 5. Prima verifica

Automatica, da una macchina con le variabili di produzione:

```bash
PRE_LAUNCH=1 \
LAUNCH_SUPABASE_URL=https://<ref>.supabase.co \
LAUNCH_SUPABASE_PUBLISHABLE_KEY=<chiave publishable di produzione> \
LAUNCH_DATABASE_URL=<connessione al database di produzione, basta sola lettura> \
LAUNCH_SITE_URL=https://<dominio> \
npx playwright test e2e/launch.spec.ts e2e/pending-actions.spec.ts
```

Fallisce se:
- `mailer_autoconfirm` non è `false` (Confirm email spento);
- gli accessi anonimi o l'email sono spenti, o le iscrizioni sono chiuse;
- una sessione anonima senza token, o con un token non valido, non è rifiutata con `captcha_failed`;
- ci sono dati demo in attività, luoghi, itinerari, consigli o offerte (slug `demo-` o testi `[DEMO]`);
- il cron risponde senza segreto;
- restano azioni o testi in sospeso nelle pagine (`data-pending`).

A mano:
- dalla pagina di accesso chiedi un codice a un tuo indirizzo. L'email arriva dal mittente di Resend con oggetto "Il tuo codice Isula: 123456", e il link nell'email porta al dominio di produzione;
- "Continua senza account" funziona, e il widget Turnstile non mostra "testing only";
- da ospite salva l'account con un'altra email e il codice: l'account resta lo stesso.
