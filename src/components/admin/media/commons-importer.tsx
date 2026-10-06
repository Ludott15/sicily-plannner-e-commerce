"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import type { CommonsImportResult, CommonsPreviewRow } from "@/lib/media-admin";
import { Field, FormError, TextArea, TextInput } from "../fields";

// Importatore Wikimedia Commons: righe "slug;URL della pagina del file". Prima l'anteprima
// (autore, licenza, descrizione letti dal server), poi la conferma: il server rilegge i
// metadati, scarica il file da upload.wikimedia.org e lo salva. Dal browser vanno solo le
// righe e i testi alternativi rivisti.
export function CommonsImporter({
  preview,
  confirm,
}: {
  preview: (text: unknown) => Promise<{ rows: CommonsPreviewRow[] } | { error: "invalid" }>;
  confirm: (input: unknown) => Promise<{ results: CommonsImportResult[] } | { error: "invalid" }>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<CommonsPreviewRow[] | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CommonsImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const errorText = (code: string) => t(`commonsError.${code.startsWith("fetch_") ? "fetch" : code}`, { detail: code });
  const valid = rows?.filter((r) => r.error === null && r.file) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setResults(null);
          start(async () => {
            const result = await preview(text);
            if ("error" in result) {
              setError(t("errors.invalid"));
              return;
            }
            setError(null);
            setRows(result.rows);
            setAlts(Object.fromEntries(result.rows.map((r) => [String(r.line), r.file?.description ?? ""])));
          });
        }}
      >
        <FormError message={error} />
        <Field label={t("commonsLines")} htmlFor="commons-lines" hint={t("commonsLinesHint")}>
          <TextArea
            id="commons-lines"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setRows(null);
            }}
            rows={6}
            placeholder="ortigia;https://commons.wikimedia.org/wiki/File:…"
          />
        </Field>
        <div>
          <Button type="submit" variant="secondary" disabled={pending || text.trim() === ""}>
            {t("commonsPreview")}
          </Button>
        </div>
      </form>

      {rows && (
        <section aria-labelledby="anteprima" className="flex flex-col gap-4">
          <h2 id="anteprima" className="is-display text-heading-2">
            {t("commonsPreviewTitle", { valid: valid.length, total: rows.length })}
          </h2>
          <ul className="flex flex-col divide-y divide-divider" data-testid="commons-preview">
            {rows.map((r) => (
              <li key={r.line} className="flex flex-col gap-2 py-4 md:flex-row md:gap-6" data-line={r.line} data-ok={r.error === null}>
                {r.file && (
                  // Anteprima dal server di Wikimedia, solo nell'admin.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.file.downloadUrl} alt="" className="h-32 w-48 shrink-0 rounded-sm bg-calce-sunk object-cover" loading="lazy" />
                )}
                <div className="flex flex-1 flex-col gap-1 text-body-s">
                  <p className="font-semibold">
                    {t("commonsLine", { line: r.line })} · {r.slug ?? "—"}
                    {r.match?.ok && <> · {t("mediaMatched", { type: t(`entity.${r.match.entity.type}`), name: r.match.entity.name })}</>}
                  </p>
                  {r.file && (
                    <p>
                      {r.file.title} · {r.file.width}×{r.file.height} · {t("mediaAuthor")}: {r.file.author ?? "—"} ·{" "}
                      {t("mediaLicense")}: {r.file.license}
                    </p>
                  )}
                  {r.file && !r.file.author && <p className="text-danger">{t("commonsAuthorMissing")}</p>}
                  {r.file?.warnings.map((w) => (
                    <p key={w} className="text-danger">
                      {t(`commonsWarning.${w}`)}
                    </p>
                  ))}
                  {r.error && <p className="font-semibold text-danger">{errorText(r.error)}</p>}
                  {r.error === null && r.file && (
                    <Field label={t("mediaAltIt")} htmlFor={`alt-${r.line}`} hint={t("commonsAltHint")}>
                      <TextInput
                        id={`alt-${r.line}`}
                        value={alts[String(r.line)] ?? ""}
                        maxLength={300}
                        onChange={(e) => setAlts((prev) => ({ ...prev, [String(r.line)]: e.target.value }))}
                      />
                    </Field>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="primary"
              disabled={pending || valid.length === 0}
              onClick={() =>
                start(async () => {
                  const result = await confirm({ text, alts });
                  if ("error" in result) {
                    setError(t("errors.invalid"));
                    return;
                  }
                  setResults(result.results);
                  setRows(null);
                  router.refresh();
                })
              }
            >
              {t("commonsConfirm", { count: valid.length })}
            </Button>
          </div>
        </section>
      )}

      {results && (
        <section aria-labelledby="risultato" className="flex flex-col gap-2">
          <h2 id="risultato" className="is-display text-heading-2">
            {t("commonsResultTitle")}
          </h2>
          <ul className="flex flex-col gap-1 text-body-s" data-testid="commons-results">
            {results.map((r) => (
              <li key={r.line}>
                {t("commonsLine", { line: r.line })} ·{" "}
                {r.ok && r.mediaId ? (
                  <>
                    <Link href={`/admin/media/${r.mediaId}`}>{t("commonsImported")}</Link>
                    {r.becameCover && <> · {t("mediaBecameCover")}</>}
                  </>
                ) : (
                  <span className="text-danger">{errorText(r.error ?? "invalid_line")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
