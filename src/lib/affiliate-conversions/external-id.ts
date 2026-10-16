import { createHash } from "node:crypto";

export type ExternalIdInput = {
  partner: string;
  subid: string;
  reportedAt: string;
  amountEur: string;
};

// Identificatore esterno calcolato quando il report del partner non ne ha uno: sha256 in hex di
// "partner|subid|reported_at|amount_eur". Stabile: lo stesso file importato due volte dà le stesse righe.
export function externalIdFor(input: ExternalIdInput): string {
  return createHash("sha256")
    .update(`${input.partner}|${input.subid}|${input.reportedAt}|${input.amountEur}`)
    .digest("hex");
}
