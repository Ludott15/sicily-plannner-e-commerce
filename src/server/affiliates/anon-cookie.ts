import "server-only";
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { hasAnalyticsConsent, parseConsent } from "@/lib/consent";

// Identificativo anonimo dei visitatori senza account (anon_id), condiviso dalle uscite
// affiliate: /api/go/[id] e /api/go/flight. Si imposta e si legge solo con il consenso ai cookie
// non tecnici ("accepted"): senza consenso il click si registra con il solo subid, senza anon_id.

export const ANON_COOKIE = "anon_id";

const uuid = z.uuid();

export function analyticsConsentFromCookie(value: string | undefined): boolean {
  return hasAnalyticsConsent(parseConsent(value));
}

// anon_id da usare per questo click: quello del cookie se valido, altrimenti uno nuovo.
// Senza consenso: null.
export function anonIdFor(cookieValue: string | undefined, consented: boolean): string | null {
  if (!consented) return null;
  return cookieValue && uuid.safeParse(cookieValue).success ? cookieValue : randomUUID();
}

// Imposta il cookie solo se l'identificativo è nuovo rispetto a quello già in cookie.
export function setAnonCookie(response: NextResponse, anonId: string | null, cookieValue: string | undefined): void {
  if (!anonId || anonId === cookieValue) return;
  response.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
