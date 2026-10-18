"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { FormError, FormNotice, Select } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Stagioni (passo 5.3): chiusura della stagione e stato del premio di ogni riga. Le azioni arrivano
// dalla pagina server come prop (il file *.admin.ts non si importa dai componenti). Dopo un salvataggio
// riuscito la pagina si rigenera, così la tabella mostra i dati scritti.

export type PrizeStatus = "pending" | "assigned" | "shipped";

const PRIZE_STATUSES: readonly PrizeStatus[] = ["pending", "assigned", "shipped"];

function isPrizeStatus(value: string): value is PrizeStatus {
  return (PRIZE_STATUSES as readonly string[]).includes(value);
}

export function CloseSeasonForm({ action, season }: { action: AdminFormAction; season: string }) {
  const t = useTranslations("AdminSeasons");
  const router = useRouter();
  const save = useAdminForm(action);

  useEffect(() => {
    if (save.state.status === "saved") router.refresh();
  }, [save.state, router]);

  const errorText =
    save.state.status === "error" ? (save.state.code === "invalid" ? t("errorInvalid") : t("errorFailed")) : null;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
      <input type="hidden" name="season" value={season} />
      <FormError message={errorText} />
      <FormNotice message={save.state.status === "saved" ? t("closed") : null} />
      <p className="text-body-s text-lava-muted">{t("closeHint")}</p>
      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {save.pending ? t("closing") : t("closeButton")}
        </button>
      </div>
    </form>
  );
}

export function PrizeStatusForm({
  action,
  season,
  rank,
  status,
}: {
  action: AdminFormAction;
  season: string;
  rank: number;
  status: string;
}) {
  const t = useTranslations("AdminSeasons");
  const router = useRouter();
  const save = useAdminForm(action);
  const current: PrizeStatus = isPrizeStatus(status) ? status : "pending";
  const id = `prize-${season}-${rank}`;

  useEffect(() => {
    if (save.state.status === "saved") router.refresh();
  }, [save.state, router]);

  const errorText =
    save.state.status === "error" ? (save.state.code === "invalid" ? t("errorInvalid") : t("errorFailed")) : null;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="rank" value={rank} />
      <div className="flex flex-wrap items-center gap-2">
        <Select id={id} name="status" defaultValue={current} aria-label={t("prizeStatusLabel")} className="w-auto min-w-44">
          <option value="pending">{t("prizePending")}</option>
          <option value="assigned">{t("prizeAssigned")}</option>
          <option value="shipped">{t("prizeShipped")}</option>
        </Select>
        <button type="submit" className={buttonClass("secondary", "sm")} disabled={save.pending}>
          {t("savePrize")}
        </button>
      </div>
      <FormError message={errorText} />
      <FormNotice message={save.state.status === "saved" ? t("prizeSaved") : null} />
    </form>
  );
}
