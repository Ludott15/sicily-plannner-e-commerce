import { describe, expect, it } from "vitest";
import { describeChange } from "./group-changes";

describe("describeChange", () => {
  it("traduce ogni tipo nella sua chiave con i parametri del payload", () => {
    expect(describeChange("stop_added", { title: "Cefalù", day: 2 })).toEqual({
      key: "stopAdded",
      values: { title: "Cefalù", day: 2 },
    });
    expect(describeChange("stop_moved", { title: "Scala dei Turchi", day: 3 })?.key).toBe("stopMoved");
    expect(describeChange("stop_removed", { title: "Noto", day: 1 })?.key).toBe("stopRemoved");
    expect(describeChange("proposal_accepted", { title: "Noto", day: 1 })?.key).toBe("proposalAccepted");
    expect(describeChange("day_added", { day: 4 })).toEqual({ key: "dayAdded", values: { day: 4 } });
    expect(describeChange("day_removed", { day: 4 })).toEqual({ key: "dayRemoved", values: { day: 4 } });
  });

  it("per la sostituzione porta titolo prima e dopo", () => {
    expect(describeChange("stop_replaced", { before: "Vecchio", after: "Nuovo", day: 1 })).toEqual({
      key: "stopReplaced",
      values: { before: "Vecchio", after: "Nuovo", day: 1 },
    });
  });

  it("salta i tipi sconosciuti e i payload senza titolo", () => {
    expect(describeChange("stop_exploded", { title: "x", day: 1 })).toBeNull();
    expect(describeChange("stop_added", { title: "  ", day: 1 })).toBeNull();
  });

  it("usa il giorno 1 se manca o non è valido", () => {
    expect(describeChange("day_added", {})).toEqual({ key: "dayAdded", values: { day: 1 } });
    expect(describeChange("day_added", { day: -3 })).toEqual({ key: "dayAdded", values: { day: 1 } });
  });
});
