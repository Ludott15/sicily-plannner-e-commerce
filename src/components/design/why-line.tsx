import { useTranslations } from "next-intl";

// Il perché di un suggerimento (manuale, "Elementi firma").
// "Per te" nei viaggi singoli, "Per il gruppo" nei viaggi di gruppo. Al massimo due motivi,
// che spiegano e non ripetono l'input. Nel gruppo i motivi sono solo aggregati e, sotto i
// 3 membri, solo logistici: la regola la applica chi calcola i motivi (server/groups/aggregate.ts),
// qui non arrivano mai preferenze di singoli membri.

export type Why = { kind: "personal" | "group"; reasons: string[] };

export function WhyLine({ why }: { why: Why }) {
  const t = useTranslations("Design");
  if (process.env.NODE_ENV !== "production" && why.reasons.length > 2) {
    console.warn(`Il perché: al massimo due motivi, ricevuti ${why.reasons.length}.`);
  }
  return (
    <p className="is-why">
      <b>{t(why.kind === "group" ? "forGroup" : "forYou")}</b> {why.reasons.slice(0, 2).join(" · ")}
    </p>
  );
}
