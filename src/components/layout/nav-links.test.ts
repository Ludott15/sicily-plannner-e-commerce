import { describe, expect, it } from "vitest";
import { isNavCurrent, PRIMARY_NAV, SERVICE_NAV } from "@/components/layout/nav-links";

describe("isNavCurrent", () => {
  it("riconosce la voce sulla sua pagina e sulle sottopagine", () => {
    expect(isNavCurrent("/attivita", "/attivita")).toBe(true);
    expect(isNavCurrent("/attivita/duomo-di-noto", "/attivita")).toBe(true);
    expect(isNavCurrent("/guide/come-arrivare", "/guide")).toBe(true);
  });

  it("non confonde voci con lo stesso inizio di percorso", () => {
    expect(isNavCurrent("/attivitaextra", "/attivita")).toBe(false);
    expect(isNavCurrent("/itinerari", "/attivita")).toBe(false);
    expect(isNavCurrent("/", "/guide")).toBe(false);
  });

  it("ignora l'ancora del percorso", () => {
    expect(isNavCurrent("/servizi", "/servizi#tutti")).toBe(true);
    expect(isNavCurrent("/servizi", "/servizi")).toBe(true);
    expect(isNavCurrent("/voli", "/servizi#tutti")).toBe(false);
  });

  it("le voci del menu Servizi puntano solo alle pagine previste", () => {
    const hrefs = SERVICE_NAV.map((item) => item.href.split("#")[0]);
    expect(hrefs).toEqual(["/voli", "/dove-dormire", "/noleggio-auto", "/traghetti", "/servizi"]);
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual(["/itinerari", "/attivita", "/guide"]);
  });
});
