import type { ConversionPartner, ConversionRow } from "@/lib/affiliate-conversions/types";

// Adattatore dei report di conversione via API di un partner (passo 3.3). Il cron
// /api/cron/import-conversions esegue quelli configurati, uno alla volta.
// Nessun adattatore è attivo: i report API dei partner vanno verificati con le loro condizioni
// (docs/LANCIO.md). Per aggiungerne uno: un modulo che implementa l'interfaccia e una voce qui.
// fetchConversions legge solo la finestra [from, to] e produce righe già normalizzate, con
// external_id del partner e reportedAt YYYY-MM-DD.

export type ConversionAdapter = {
  partner: ConversionPartner;
  isConfigured(): boolean;
  fetchConversions(from: Date, to: Date): AsyncIterable<ConversionRow>;
};

export const CONVERSION_ADAPTERS: readonly ConversionAdapter[] = [];
