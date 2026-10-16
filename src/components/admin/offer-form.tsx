"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { Checkbox, Field, FormError, Select, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Offerta di un partner per un'attività (activity_offers). I fatti del partner (voto,
// recensioni, cancellazione) sono facoltativi: vuoti, l'offerta non li mostra.

export type OfferFormValues = {
  id?: string;
  partner: string;
  partnerProductId: string;
  title: string;
  priceFromEur: string | null;
  currency: string;
  affiliateUrl: string;
  rating: string | null;
  reviewsCount: number | null;
  freeCancellation: boolean | null;
  isActive: boolean;
};

const PARTNERS = ["getyourguide", "viator", "civitatis", "travelpayouts", "car_rental"];

export function OfferForm({
  action,
  deleteAction,
  locale,
  activityId,
  values,
}: {
  action: AdminFormAction;
  deleteAction?: AdminFormAction;
  locale: string;
  activityId: string;
  values: OfferFormValues;
}) {
  const t = useTranslations("Admin");
  const save = useAdminForm(action);
  const remove = useAdminForm(deleteAction ?? action);
  const prefix = values.id ?? "nuova";
  const state = save.state.status === "error" ? save.state : remove.state;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <form onSubmit={save.onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={values.id ?? ""} />
        <input type="hidden" name="activityId" value={activityId} />
        <input type="hidden" name="locale" value={locale} />
        <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("offerTitle")} htmlFor={`${prefix}-title`}>
            <TextInput id={`${prefix}-title`} name="title" defaultValue={values.title} required />
          </Field>
          <Field label={t("fieldPartner")} htmlFor={`${prefix}-partner`}>
            <Select id={`${prefix}-partner`} name="partner" defaultValue={values.partner}>
              {PARTNERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("fieldPartnerProduct")} htmlFor={`${prefix}-product`}>
            <TextInput id={`${prefix}-product`} name="partnerProductId" defaultValue={values.partnerProductId} required />
          </Field>
          <Field label={t("fieldAffiliateUrl")} htmlFor={`${prefix}-url`}>
            <TextInput id={`${prefix}-url`} name="affiliateUrl" type="url" defaultValue={values.affiliateUrl} required />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Field label={t("offerPrice")} htmlFor={`${prefix}-price`}>
            <TextInput id={`${prefix}-price`} name="priceFromEur" inputMode="decimal" defaultValue={values.priceFromEur ?? ""} />
          </Field>
          <Field label={t("offerCurrency")} htmlFor={`${prefix}-currency`}>
            <TextInput id={`${prefix}-currency`} name="currency" maxLength={3} defaultValue={values.currency} required />
          </Field>
          <Field label={t("fieldRating")} htmlFor={`${prefix}-rating`}>
            <TextInput id={`${prefix}-rating`} name="rating" inputMode="decimal" defaultValue={values.rating ?? ""} />
          </Field>
          <Field label={t("offerReviews")} htmlFor={`${prefix}-reviews`}>
            <TextInput id={`${prefix}-reviews`} name="reviewsCount" inputMode="numeric" defaultValue={values.reviewsCount ?? ""} />
          </Field>
          <Field label={t("offerFreeCancellation")} htmlFor={`${prefix}-cancel`}>
            <Select
              id={`${prefix}-cancel`}
              name="freeCancellation"
              defaultValue={values.freeCancellation === null ? "" : values.freeCancellation ? "yes" : "no"}
            >
              <option value="">{t("unknown")}</option>
              <option value="yes">{t("yes")}</option>
              <option value="no">{t("no")}</option>
            </Select>
          </Field>
        </div>

        <Checkbox label={t("offerActive")} name="isActive" defaultChecked={values.isActive} />
        <div>
          <Button type="submit" variant="primary" disabled={save.pending}>
            {values.id ? t("save") : t("offerAdd")}
          </Button>
        </div>
      </form>

      {values.id && deleteAction && (
        <form onSubmit={remove.onSubmit} className="border-t border-divider pt-4">
          <input type="hidden" name="id" value={values.id} />
          <input type="hidden" name="activityId" value={activityId} />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="ghost" size="sm" disabled={remove.pending}>
            {t("offerDelete")}
          </Button>
        </form>
      )}
    </div>
  );
}
