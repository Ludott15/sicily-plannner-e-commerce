"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/design";
import type { ChosenItemResult } from "@/lib/media-chosen";

type ChosenStepResponse =
  | { ok: true; results: ChosenItemResult[]; next: number | null; total: number }
  | { ok: false; error: "invalid" | "file_invalid" };

// Importa le foto scelte dalla redazione (content/media/commons-scelte.json) a passi di tre voci,
// con avanzamento e riepilogo. Ogni passo è una chiamata server: il browser le ripete fino alla fine.
export function ChosenPhotoImporter({
  importChosen,
}: {
  importChosen: (input: unknown) => Promise<ChosenStepResponse>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [results, setResults] = useState<ChosenItemResult[]>([]);

  async function run() {
    setRunning(true);
    setFailed(false);
    setResults([]);
    setDone(0);
    let offset: number | null = 0;
    while (offset !== null) {
      const step: ChosenStepResponse | null = await importChosen({ offset }).catch(() => null);
      if (!step || !step.ok) {
        setFailed(true);
        break;
      }
      setTotal(step.total);
      setResults((prev) => [...prev, ...step.results]);
      setDone(step.next ?? step.total);
      offset = step.next;
    }
    setRunning(false);
    router.refresh();
  }

  const count = (o: ChosenItemResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  const rejected = results.filter((r) => r.outcome === "rejected");

  return (
    <section aria-labelledby="scelte-redazione" className="flex flex-col gap-3 rounded-lg border border-divider p-4">
      <h2 id="scelte-redazione" className="is-display text-heading-2">
        {t("photoChosenTitle")}
      </h2>
      <p className="text-body-s text-lava-muted">{t("photoChosenIntro")}</p>
      <div>
        <Button variant="primary" disabled={running} onClick={run}>
          {t("photoChosenButton")}
        </Button>
      </div>
      {running && total !== null && (
        <p role="status" className="text-body font-semibold">
          {t("photoChosenProgress", { done, total })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-body text-danger">
          {t("photoChosenFailed")}
        </p>
      )}
      {!running && total !== null && results.length > 0 && (
        <div className="flex flex-col gap-2 text-body-s">
          <p role="status" className="font-semibold">
            {t("photoChosenDone", {
              assigned: count("assigned"),
              already: count("already_imported"),
              rejected: count("rejected"),
              notNeeded: count("not_needed"),
            })}
          </p>
          {rejected.length > 0 && (
            <ul className="flex flex-col gap-1">
              {rejected.map((r) => (
                <li key={`${r.type}:${r.slug}`}>
                  {r.slug} · {r.file} · {r.reason ?? ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

