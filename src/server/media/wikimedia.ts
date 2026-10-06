import "server-only";
import { SafeFetchError, safeFetch, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch";

// Richieste verso Wikimedia (API di Commons e upload.wikimedia.org) secondo le sue regole:
// - User-Agent descrittivo con un contatto (https://meta.wikimedia.org/wiki/User-Agent_policy):
//   senza, Wikimedia può rifiutare o limitare le richieste;
// - una richiesta alla volta, con una breve pausa tra l'una e l'altra;
// - con 429 (troppe richieste) o 503 si aspetta e si riprova, al massimo tre volte.
// Tutto passa comunque da safeFetch (allowlist, redirect, timeout, dimensione, indirizzi interni).

const MIN_GAP_MS = 400;
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000];

export function wikimediaUserAgent() {
  const contact = process.env.WIKIMEDIA_CONTACT || process.env.NEXT_PUBLIC_SITE_URL || "https://github.com/Ludott15/sicily-plannner-e-commerce";
  return `IsulaSicilyPlanner/1.0 (${contact}) image-importer`;
}

let queue: Promise<unknown> = Promise.resolve();
let last = 0;

export type WikimediaOptions = Omit<SafeFetchOptions, "headers"> & { sleep?: (ms: number) => Promise<void> };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function wikimediaFetch(url: string, options: WikimediaOptions): Promise<SafeFetchResult> {
  const sleep = options.sleep ?? defaultSleep;
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait > 0 && !options.sleep) await sleep(wait);
      last = Date.now();
      try {
        return await safeFetch(url, { ...options, headers: { "user-agent": wikimediaUserAgent(), "api-user-agent": wikimediaUserAgent() } });
      } catch (error) {
        const retryable = error instanceof SafeFetchError && error.code === "bad_status" && (error.detail === "429" || error.detail === "503");
        if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw error;
        await sleep(RETRY_DELAYS_MS[attempt]!);
      }
    }
  };
  // In fila: una richiesta alla volta per tutto il processo.
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
