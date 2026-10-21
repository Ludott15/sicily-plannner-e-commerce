import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoute, routingBaseUrl } from "./routing";

const from = { lat: 38.1, lng: 13.3 };
const to = { lat: 38.2, lng: 13.4 };

function osrmOk(): unknown {
  return {
    code: "Ok",
    routes: [
      {
        distance: 18_400.6,
        duration: 1_500.2,
        geometry: {
          coordinates: [
            [13.3, 38.1],
            [13.35, 38.13],
            [13.4, 38.2],
          ],
        },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchRoute", () => {
  it("chiama il profilo auto con geometria GeoJSON e legge la tratta", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () => Response.json(osrmOk()));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ROUTING_URL", "https://osrm.example.test/");

    const leg = await fetchRoute(from, to);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      "https://osrm.example.test/route/v1/driving/13.3,38.1;13.4,38.2?overview=full&geometries=geojson",
    );
    expect(leg).toEqual({
      distanceM: 18_401,
      durationS: 1_500,
      coordinates: [
        [13.3, 38.1],
        [13.35, 38.13],
        [13.4, 38.2],
      ],
    });
  });

  it("restituisce null senza strada, con errore HTTP o con risposta non valida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "NoRoute", routes: [] })));
    await expect(fetchRoute(from, to)).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    await expect(fetchRoute(from, to)).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ foo: 1 })));
    await expect(fetchRoute(from, to)).resolves.toBeNull();
  });

  it("non lancia mai: rete caduta o timeout diventano null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchRoute(from, to)).resolves.toBeNull();
  });
});

describe("routingBaseUrl", () => {
  it("usa il default se la variabile manca o non è un URL", () => {
    vi.stubEnv("ROUTING_URL", "");
    expect(routingBaseUrl()).toBe("https://router.project-osrm.org");
    vi.stubEnv("ROUTING_URL", "non-un-url");
    expect(routingBaseUrl()).toBe("https://router.project-osrm.org");
  });
});
