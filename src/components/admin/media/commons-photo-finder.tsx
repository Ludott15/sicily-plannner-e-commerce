"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import type {
  AutoAssignItem,
  AutoAssignStep,
  CandidateSearch,
  PhotoCandidate,
  PhotoEntityType,
  PhotoImport,
  PhotoSearchStats,
} from "@/lib/media-admin";
import { Checkbox } from "../fields";

function useStatsText() {
  const t = useTranslations("Admin");
  return (stats?: PhotoSearchStats) => (stats ? t("photoFinderStats", stats) : "");
}

export type NeedRow = {
  type: PhotoEntityType;
  id: string;
  name: string;
  placeName: string | null;
  current: "none" | "blocked" | "illustration" | "demo";
};

// Foto vere da Wikimedia Commons per le entità senza foto: assegnazione automatica di tutte
// (il candidato più pertinente per ognuna) oppure scelta a mano tra i candidati di una.
export function CommonsPhotoFinder({
  needs,
  autoAssign,
  search,
  importPhoto,
}: {
  needs: NeedRow[];
  autoAssign: (input: unknown) => Promise<AutoAssignStep>;
  search: (input: unknown) => Promise<CandidateSearch>;
  importPhoto: (input: unknown) => Promise<PhotoImport>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [log, setLog] = useState<AutoAssignItem[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [allowSa, setAllowSa] = useState(false);
  const stop = useRef(false);
  const statsText = useStatsText();

  async function runAuto() {
    setRunning(true);
    stop.current = false;
    const skip: string[] = [];
    for (;;) {
      const step = await autoAssign({ skip, limit: 2, allowSa }).catch(() => null);
      if (!step || !step.ok) break;
      skip.push(...step.items.map((i) => i.key));
      setLog((prev) => [...prev, ...step.items]);
      setRemaining(step.remaining);
      if (step.remaining === 0 || step.items.length === 0 || stop.current) break;
    }
    setRunning(false);
    router.refresh();
  }

  const count = (o: AutoAssignItem["outcome"]) => log.filter((i) => i.outcome === o).length;
  const reason = (code?: string) => (code ? t(`commonsError.${code.startsWith("fetch_") ? "fetch" : code}`, { detail: code }) : "");

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="automatico" className="flex flex-col gap-3 rounded-lg border border-divider p-4">
        <h2 id="automatico" className="is-display text-heading-2">
          {t("photoFinderAutoTitle")}
        </h2>
        <p className="text-body-s text-lava-muted">{t("photoFinderAutoHint", { count: needs.length })}</p>
        <Checkbox
          label={t("photoFinderAllowSa")}
          checked={allowSa}
          disabled={running}
          onChange={(e) => setAllowSa(e.target.checked)}
        />
        <p className="text-caption text-lava-muted">{t("photoFinderAllowSaHint")}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={running || needs.length === 0} onClick={runAuto}>
            {t("photoFinderAuto")}
          </Button>
          {running && (
            <Button variant="secondary" onClick={() => (stop.current = true)}>
              {t("photoFinderStop")}
            </Button>
          )}
        </div>
        {log.length > 0 && (
          <>
            <p role="status" className="text-body font-semibold">
              {t("photoFinderProgress", {
                assigned: count("assigned"),
                reused: count("reused"),
                skipped: count("skipped"),
                remaining: remaining ?? 0,
              })}
            </p>
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-body-s" data-testid="photo-finder-log">
              {log.map((i) => (
                <li key={i.key} data-outcome={i.outcome}>
                  {t(`entity.${i.type}`)}: <span className="font-semibold">{i.name}</span> · {t(`photoFinderOutcome.${i.outcome}`)}
                  {i.mediaId && (
                    <>
                      {" "}
                      · <Link href={`/admin/media/${i.mediaId}`}>{t("mediaOpen")}</Link>
                    </>
                  )}
                  {i.outcome === "skipped" && (
                    <>
                      {" "}
                      · {reason(i.reason)}
                      {i.detail && <> (HTTP {i.detail})</>}
                      {i.stats && <> ({statsText(i.stats)})</>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="una-alla-volta" className="flex flex-col gap-3">
        <h2 id="una-alla-volta" className="is-display text-heading-2">
          {t("photoFinderManualTitle", { count: needs.length })}
        </h2>
        {needs.length === 0 ? (
          <p className="text-body-l text-lava-muted">{t("photoFinderEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-divider">
            {needs.map((n) => (
              <NeedItem key={`${n.type}:${n.id}`} need={n} search={search} importPhoto={importPhoto} allowSa={allowSa} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NeedItem({
  need,
  search,
  importPhoto,
  allowSa,
}: {
  need: NeedRow;
  allowSa: boolean;
  search: (input: unknown) => Promise<CandidateSearch>;
  importPhoto: (input: unknown) => Promise<PhotoImport>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [candidates, setCandidates] = useState<PhotoCandidate[] | null>(null);
  const [stats, setStats] = useState<PhotoSearchStats | undefined>(undefined);
  const statsText = useStatsText();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorText = (code: string) => t(`commonsError.${code.startsWith("fetch_") ? "fetch" : code}`, { detail: code });

  return (
    <li className="flex flex-col gap-3 py-4" data-need={`${need.type}:${need.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-body">
          <span className="text-label uppercase text-lava-muted">{t(`entity.${need.type}`)}</span>{" "}
          <span className="font-semibold">{need.name.replace(/\[DEMO\]\s*/gi, "")}</span>
          {need.placeName && <span className="text-lava-muted"> · {need.placeName}</span>}
          <span className="text-body-s text-lava-muted"> · {t(`photoFinderCurrent.${need.current}`)}</span>
        </p>
        {done ? (
          <Link href={`/admin/media/${done}`} className="text-body-s">
            {t("photoFinderDone")}
          </Link>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await search({ type: need.type, id: need.id, allowSa });
                if (!result.ok) {
                  setError(`${errorText(result.error)}${result.detail ? ` (HTTP ${result.detail})` : ""}`);
                  return;
                }
                setError(null);
                setCandidates(result.candidates);
                setStats(result.stats);
              })
            }
          >
            {t("photoFinderSearch")}
          </Button>
        )}
      </div>
      {error && <p className="text-body-s font-semibold text-danger">{error}</p>}
      {candidates && !done && (
        candidates.length === 0 ? (
          <p className="text-body-s text-lava-muted">
            {t("photoFinderNoCandidates")} ({statsText(stats)})
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {candidates.map((c) => (
              <li key={c.pageUrl} className="flex flex-col gap-2 text-body-s">
                {/* Anteprima dal server di Wikimedia, solo nell'admin. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.previewUrl} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-sm bg-calce-sunk object-cover" />
                <a href={c.pageUrl} target="_blank" rel="noopener noreferrer" className="line-clamp-2">
                  {c.title.replace(/^File:/, "")}
                </a>
                <span className="text-lava-muted">
                  {c.author} · {c.license} · {c.width}×{c.height}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await importPhoto({ type: need.type, id: need.id, pageUrl: c.pageUrl, allowSa });
                      if (!result.ok) {
                        setError(`${errorText(result.error ?? "storage_failed")}${result.detail ? ` (HTTP ${result.detail})` : ""}`);
                        return;
                      }
                      setDone(result.mediaId);
                      router.refresh();
                    })
                  }
                >
                  {t("photoFinderUse")}
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </li>
  );
}
