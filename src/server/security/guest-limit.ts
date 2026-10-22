import "server-only";
import { headers } from "next/headers";
import { AUTH_RULES, checkRates, ipIdentity, type RateDecision } from "./rate-limit";

// Sessioni ospite (passo 11.5), per IP, prima di creare l'utente anonimo. Il CAPTCHA resta la prima
// difesa; questo limite conta anche le richieste che il CAPTCHA non ferma. Senza IP il limite non si
// applica (vedi ipIdentity).
export async function guestSessionDecision(): Promise<RateDecision> {
  const ip = ipIdentity(await headers());
  if (ip === null) return "allowed";
  return checkRates([{ rule: AUTH_RULES.guestIp, identity: ip }]);
}
