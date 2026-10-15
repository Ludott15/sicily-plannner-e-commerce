// Frasi del registro delle modifiche (passo 4.2). Pura: dal tipo e dal payload strutturato sceglie
// la chiave del messaggio e i suoi parametri; le frasi stanno in messages/*.json (next-intl).

export const CHANGE_KINDS = [
  "stop_added",
  "stop_removed",
  "stop_moved",
  "stop_replaced",
  "day_added",
  "day_removed",
  "proposal_accepted",
] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

export type ChangeMessage =
  | { key: "stopAdded"; values: { title: string; day: number } }
  | { key: "stopRemoved"; values: { title: string; day: number } }
  | { key: "stopMoved"; values: { title: string; day: number } }
  | { key: "stopReplaced"; values: { before: string; after: string; day: number } }
  | { key: "dayAdded"; values: { day: number } }
  | { key: "dayRemoved"; values: { day: number } }
  | { key: "proposalAccepted"; values: { title: string; day: number } };

function text(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value : "";
}

function day(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}

// Null se il tipo non è noto o il payload non ha i campi necessari: la riga si salta, non si mostra.
export function describeChange(kind: string, payload: Record<string, unknown>): ChangeMessage | null {
  const title = text(payload.title);
  switch (kind) {
    case "stop_added":
      return title ? { key: "stopAdded", values: { title, day: day(payload.day) } } : null;
    case "stop_removed":
      return title ? { key: "stopRemoved", values: { title, day: day(payload.day) } } : null;
    case "stop_moved":
      return title ? { key: "stopMoved", values: { title, day: day(payload.day) } } : null;
    case "stop_replaced":
      return { key: "stopReplaced", values: { before: text(payload.before), after: text(payload.after), day: day(payload.day) } };
    case "day_added":
      return { key: "dayAdded", values: { day: day(payload.day) } };
    case "day_removed":
      return { key: "dayRemoved", values: { day: day(payload.day) } };
    case "proposal_accepted":
      return title ? { key: "proposalAccepted", values: { title, day: day(payload.day) } } : null;
    default:
      return null;
  }
}
