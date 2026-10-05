import "server-only";
import { timingSafeEqual } from "node:crypto";

// I cron di Vercel mandano "Authorization: Bearer <CRON_SECRET>". Senza CRON_SECRET
// configurato nessuna richiesta passa: un cron non deve mai essere pubblico.
export function isAuthorizedCron(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
