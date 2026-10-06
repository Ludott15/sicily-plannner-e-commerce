"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/design";
import type { EntityMatch, PreparedUpload, ProcessedUpload } from "@/lib/media-admin";
import { publicEnv } from "@/lib/env";

// Caricamento multiplo dell'admin. Per ogni file:
// 1. prepare: il server controlla nome, tipo e dimensione dichiarati e firma un URL di
//    caricamento in incoming/ (scrittura consentita solo all'admin dalla policy);
// 2. il browser carica il file su quell'URL (fuori dalla funzione serverless);
// 3. process: il server controlla il contenuto, toglie EXIF e GPS, genera le varianti e
//    cancella il file grezzo.
// L'abbinamento all'entità usa il nome file: slug-NN.jpg (illustrazioni delle aree: slug-NN.svg).

type Row = { name: string; status: "waiting" | "uploading" | "done" | "error"; message?: string };

export function MediaUploader({
  prepare,
  process,
}: {
  prepare: (files: unknown) => Promise<PreparedUpload[] | { error: "invalid" }>;
  process: (input: unknown) => Promise<ProcessedUpload>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const matchText = (match: EntityMatch) =>
    match.ok ? t("mediaMatched", { type: t(`entity.${match.entity.type}`), name: match.entity.name }) : t(`mediaMatch.${match.error}`);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const files = [...(input.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    const update = (i: number, row: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...row } : r)));
    setRows(files.map((f) => ({ name: f.name, status: "waiting" })));

    const prepared = await prepare(files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
    if ("error" in prepared) {
      setRows(files.map((f) => ({ name: f.name, status: "error", message: t("errors.invalid") })));
      setBusy(false);
      return;
    }
    for (const [i, item] of prepared.entries()) {
      if (!item.ok) {
        update(i, { status: "error", message: t(`mediaUploadError.${item.error}`) });
        continue;
      }
      update(i, { status: "uploading" });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", files[i]!);
      const put = await fetch(item.uploadUrl, {
        method: "PUT",
        body,
        headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      }).catch(() => null);
      if (!put?.ok) {
        update(i, { status: "error", message: t("mediaUploadError.storage_failed") });
        continue;
      }
      const result = await process({ path: item.path, name: item.name });
      if (!result.ok) {
        const e = result.error;
        update(i, {
          status: "error",
          message:
            e.code === "too_small"
              ? t("mediaUploadError.too_small", { width: e.width, height: e.height })
              : e.code === "unsafe_svg"
                ? t("mediaUploadError.unsafe_svg", { reason: e.reason })
                : t(`mediaUploadError.${e.code}`),
        });
        continue;
      }
      update(i, {
        status: "done",
        message: `${matchText(result.match)}${result.becameCover ? ` · ${t("mediaBecameCover")}` : ""}`,
      });
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-divider p-4">
      <label htmlFor="files" className="text-body font-semibold">
        {t("mediaUploadLabel")}
      </label>
      <p className="text-body-s text-lava-muted">{t("mediaUploadHint")}</p>
      <input id="files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml" />
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {t("mediaUploadSubmit")}
        </Button>
      </div>
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1 text-body-s" aria-live="polite" data-testid="upload-results">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} data-status={r.status}>
              <span className="font-semibold">{r.name}</span> · {t(`mediaUploadStatus.${r.status}`)}
              {r.message && <> · {r.message}</>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
