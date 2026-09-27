// Generato da scripts/design/generate-tokens.mjs a partire da docs/design/tokens.json. Non modificare a mano: npm run design:tokens
// Font variabili: si carica l'intervallo dei pesi; i pesi usati vengono dai token.
import { Fraunces, Instrument_Sans } from "next/font/google";

export const fontDisplay = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
  variable: "--font-display-face",
});

export const fontSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-face",
});

export const fontVariables = [fontDisplay.variable, fontSans.variable].join(" ");
