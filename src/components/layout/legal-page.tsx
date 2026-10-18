import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { LEGAL_DOCS, type LegalDocId } from "@generated/content/legal";
import { Markdown } from "@/components/editorial/markdown";
import { legalEntity } from "@/lib/legal-entity";
import { fillLegalVariables } from "@/lib/legal-text";
import { parseMarkdown } from "@/lib/markdown";
import { TextPage } from "./text-page";

// Pagina di un testo legale (Privacy, Cookie, Condizioni di vendita, Termini, regolamento dei punti,
// Chi siamo). Il testo viene da LEGAL_DOCS (generato da content/legal/*.md): titolo, data di
// aggiornamento e versione, poi il Markdown con le variabili del titolare.
// Senza dati del titolare (legalEntity() null) le variabili diventano "—" e la pagina mostra un
// avviso in cima: la pagina resta noindex e fuori dalla sitemap (isLegalReady).
// In inglese, finché non c'è la traduzione, si mostra il testo italiano con l'avviso.
export async function LegalPage({
  doc,
  title,
  intro,
}: {
  doc: LegalDocId;
  title: string;
  intro?: string;
}) {
  const [t, format, locale] = await Promise.all([
    getTranslations("Legal"),
    getFormatter(),
    getLocale(),
  ]);
  const record = LEGAL_DOCS[doc];
  const entity = legalEntity();
  const showItalianNotice = locale !== "it" && record.en === null;
  const source = locale !== "it" && record.en !== null ? record.en : record.it;
  const blocks = parseMarkdown(fillLegalVariables(source, entity, locale));
  const date = format.dateTime(new Date(`${record.updatedAt}T12:00:00Z`), {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  });

  return (
    <TextPage eyebrow={t("eyebrow")} title={title} intro={intro}>
      {!entity && (
        <p
          role="note"
          data-legal-entity="missing"
          className="rounded-md border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body font-semibold"
        >
          {t("preparing")}
        </p>
      )}
      <div className="flex flex-col gap-2 text-body-s text-lava-muted">
        <p>{t("updatedOn", { date, version: record.version })}</p>
        {showItalianNotice && <p>{t("onlyItalian")}</p>}
      </div>
      <Markdown blocks={blocks} />
    </TextPage>
  );
}
