import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ConsentSwitches, type ConsentView } from "@/components/privacy/consent-switches";
import { DeleteAccount } from "@/components/privacy/delete-account";
import { requireUser } from "@/server/auth";
import { deleteConfirmationFor } from "@/server/privacy/config";
import { listConsents, type ConsentRecord } from "@/server/privacy/consents";

// Account › Privacy (passo 8.2): consensi con il loro interruttore e la data dell'ultima scelta,
// scarico dei propri dati (route GET /api/account/export: JSON e CSV dei punti, nessun file salvato),
// eliminazione dell'account (o dei dati dell'ospite) in una zona di pericolo separata.
// Pagina personale: non indicizzata. Per l'ospite restano i consensi (profilazione, posizione, dati
// sensibili: anche senza account), lo scarico e l'eliminazione dei dati dell'ospite.
// Le newsletter arrivano con il passo 8.1.
const SHOWN = ["profiling", "location", "sensitive"] as const;

const EXPORTS = [
  { href: "/api/account/export?formato=json", key: "downloadJson" },
  { href: "/api/account/export?formato=csv", key: "downloadCsv" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, tProfile, format, consents] = await Promise.all([
    getTranslations("Privacy"),
    getTranslations("Profile"),
    getFormatter(),
    listConsents(user),
  ]);

  // Lo stato di un consenso è l'ultima riga per tipo (l'elenco arriva dal più recente).
  const latest = new Map<string, ConsentRecord>();
  for (const row of consents) if (!latest.has(row.kind)) latest.set(row.kind, row);

  const views: ConsentView[] = SHOWN.map((kind) => {
    const row = latest.get(kind);
    return {
      kind,
      title: t(`consent.${kind}.title`),
      text: t(`consent.${kind}.text`),
      granted: row?.granted ?? false,
      changedLabel: row
        ? t("lastChoice", { date: format.dateTime(row.createdAt, { dateStyle: "long" }) })
        : t("never"),
    };
  });

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tProfile("title"), href: "/profilo" }]}
        breadcrumbLabel={t("breadcrumbLabel")}
      />

      <section aria-labelledby="privacy-consents" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="privacy-consents" className="text-heading-3">
            {t("consentsHeading")}
          </h2>
          <p className="text-body-s text-lava-muted">{t("consentsIntro")}</p>
        </div>
        <ConsentSwitches consents={views} />
      </section>

      <section aria-labelledby="privacy-download" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="privacy-download" className="text-heading-3">
            {t("downloadHeading")}
          </h2>
          <p className="text-body text-pretty">{t("downloadText")}</p>
        </div>
        <ul className="is-settings">
          {EXPORTS.map(({ href, key }) => (
            <li key={href}>
              <a href={href} className="is-setting">
                <span className="is-setting__label">{t(key)}</span>
                <Download aria-hidden="true" className="is-setting__action size-5" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="is-danger">
        <DeleteAccount isGuest={Boolean(user.is_anonymous)} phrase={deleteConfirmationFor(locale)} />
      </div>
    </PageContainer>
  );
}
