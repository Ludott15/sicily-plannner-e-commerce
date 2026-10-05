import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_PROJECT_ID,
  productionBlock,
  productionConfigProblems,
  inheritedProviderEnvNames,
  productionEnvNames,
  pushPreflightProblems,
} from "./production-config.mjs";

const toml = readFileSync("supabase/config.toml", "utf8");

describe("blocco [remotes.production] di supabase/config.toml", () => {
  // Questo test gira in CI: fallisce se il blocco di produzione contiene valori locali,
  // chiavi di prova di Cloudflare o segreti scritti nel file.
  it("nessun valore locale né chiave di prova, segreti da env()", () => {
    expect(productionConfigProblems(toml)).toEqual([]);
  });

  it("il blocco esiste ed è separato dalla configurazione locale", () => {
    const block = productionBlock(toml);
    expect(block).toContain("[remotes.production]");
    expect(block).not.toContain("[auth]\n");
  });
});

describe("controlli del blocco di produzione", () => {
  const good = `
[auth]
site_url = "http://localhost:3000"

[remotes.production]
project_id = "${PLACEHOLDER_PROJECT_ID}"

[remotes.production.auth]
site_url = "env(PRODUCTION_SITE_URL)"
additional_redirect_urls = ["env(PRODUCTION_AUTH_CALLBACK_URL)"]

[remotes.production.auth.rate_limit]
email_sent = 100

[remotes.production.auth.captcha]
enabled = true
secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"

[remotes.production.auth.email]
enable_confirmations = true

[remotes.production.auth.email.smtp]
enabled = true
pass = "env(RESEND_API_KEY)"
admin_email = "env(SMTP_SENDER_EMAIL)"
`;

  it("un blocco giusto passa, anche se la configurazione locale ha localhost", () => {
    expect(productionConfigProblems(good)).toEqual([]);
  });

  it("localhost, http e chiavi di prova nel blocco: errore", () => {
    expect(productionConfigProblems(good.replace("env(PRODUCTION_SITE_URL)", "http://localhost:3000"))).toEqual(
      expect.arrayContaining(["valori locali (localhost o 127.0.0.1)", "URL non https", "auth.site_url deve venire da env()"]),
    );
    expect(
      productionConfigProblems(good.replace("env(SUPABASE_AUTH_CAPTCHA_SECRET)", "1x0000000000000000000000000000000AA")),
    ).toEqual(expect.arrayContaining(["chiavi di prova di Cloudflare Turnstile", "captcha.secret deve venire da env()"]));
  });

  it("i commenti non contano", () => {
    expect(productionConfigProblems(good.replace("email_sent = 100", "email_sent = 100 # non localhost"))).toEqual([]);
  });

  it("conferme spente, SMTP spento, limiti bassi, blocco assente", () => {
    expect(productionConfigProblems(good.replace("enable_confirmations = true", "enable_confirmations = false"))).toEqual([
      "enable_confirmations deve essere true",
    ]);
    expect(productionConfigProblems(good.replace("[remotes.production.auth.email.smtp]\nenabled = true", "[remotes.production.auth.email.smtp]\nenabled = false"))).toEqual([
      "SMTP personalizzato non attivo",
    ]);
    expect(productionConfigProblems(good.replace("email_sent = 100", "email_sent = 2"))).toEqual([
      "rate_limit.email_sent troppo basso per la produzione (almeno 30 all'ora)",
    ]);
    expect(productionConfigProblems("[auth]\nsite_url = \"x\"")).toEqual(["manca il blocco [remotes.production]"]);
  });
});

describe("controlli prima del push verso produzione", () => {
  const env = {
    PRODUCTION_SITE_URL: "https://isula.example",
    PRODUCTION_AUTH_CALLBACK_URL: "https://isula.example/api/auth/callback",
    SUPABASE_AUTH_CAPTCHA_SECRET: "0x4AAAAAAA-vero",
    RESEND_API_KEY: "re_vero",
    SMTP_SENDER_EMAIL: "accesso@isula.example",
    SMTP_SENDER_NAME: "Isula",
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "client-vero",
    SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "secret-vero",
  };
  const ready = toml.replace(`project_id = "${PLACEHOLDER_PROJECT_ID}"`, 'project_id = "abcdefghijklmnopqrst"');

  it("pronto: nessun problema", () => {
    expect(pushPreflightProblems({ toml: ready, linkedRef: "abcdefghijklmnopqrst", env })).toEqual([]);
  });

  it("segnaposto, progetto non collegato o diverso: bloccato", () => {
    expect(pushPreflightProblems({ toml, linkedRef: PLACEHOLDER_PROJECT_ID, env })).toContain(
      "project_id è ancora il segnaposto: scrivi il ref del progetto di produzione",
    );
    expect(pushPreflightProblems({ toml: ready, linkedRef: null, env })).toHaveLength(1);
    expect(pushPreflightProblems({ toml: ready, linkedRef: "zyxwvutsrqponmlkjihg", env })[0]).toMatch(/non è quello/);
  });

  it("variabili mancanti, locali o chiavi di prova: bloccato", () => {
    const missing: Record<string, string> = { ...env };
    delete missing.RESEND_API_KEY;
    expect(pushPreflightProblems({ toml: ready, linkedRef: "abcdefghijklmnopqrst", env: missing })).toEqual([
      "variabile RESEND_API_KEY non impostata",
    ]);
    expect(
      pushPreflightProblems({
        toml: ready,
        linkedRef: "abcdefghijklmnopqrst",
        env: { ...env, PRODUCTION_SITE_URL: "http://localhost:3000", SUPABASE_AUTH_CAPTCHA_SECRET: "1x0000000000000000000000000000000AA" },
      }),
    ).toEqual(["PRODUCTION_SITE_URL ha un valore locale", "SUPABASE_AUTH_CAPTCHA_SECRET è una chiave di prova di Cloudflare"]);
  });

  it("le variabili richieste: quelle del blocco più i provider attivi ereditati (Google)", () => {
    expect([...productionEnvNames(toml), ...inheritedProviderEnvNames(toml)].sort()).toEqual(Object.keys(env).sort());
    expect(inheritedProviderEnvNames(["[auth.external.apple]", "enabled = false", 'secret = "env(A)"'].join("\n"))).toEqual([]);
  });
});
