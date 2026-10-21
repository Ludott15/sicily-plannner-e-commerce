import "server-only";
import { z } from "zod";
import type { LatLng, RouteShape } from "@/lib/maps/legs";
import { simplifyLine } from "./simplify";

// Percorso stradale tra due punti (OSRM, profilo auto). Il server di default è la demo pubblica di
// OSRM: per la produzione con traffico serve un servizio con licenza adeguata (vedi docs/LANCIO.md).
export const DEFAULT_ROUTING_URL = "https://router.project-osrm.org";
const TIMEOUT_MS = 8_000;

const osrmResponse = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
      }),
    )
    .min(1),
});

export function routingBaseUrl(): string {
  const configured = process.env.ROUTING_URL?.trim() ?? "";
  const base = configured !== "" && z.url().safeParse(configured).success ? configured : DEFAULT_ROUTING_URL;
  return base.replace(/\/+$/, "");
}

// Tratta guidata da from a to. Restituisce null per qualsiasi errore (rete, timeout, risposta non
// valida, nessuna strada): il chiamante conta il fallimento e riprova al giro successivo.
// La geometria arriva già semplificata (circa 30 m, massimo 400 punti).
export async function fetchRoute(from: LatLng, to: LatLng): Promise<RouteShape | null> {
  const url =
    `${routingBaseUrl()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    "?overview=full&geometries=geojson";
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = osrmResponse.safeParse(await response.json());
    if (!parsed.success || parsed.data.code !== "Ok") return null;
    const route = parsed.data.routes[0]!;
    return {
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
      coordinates: simplifyLine(route.geometry.coordinates),
    };
  } catch {
    return null;
  }
}
