// Annuncio per il lettore di schermo che sopravvive a una redirezione (dopo "Aggiungi al viaggio" o
// "Salva il viaggio" l'azione porta a un'altra pagina). Il messaggio è di interfaccia, senza dati
// personali, e vale solo per pochi secondi: una pagina lo legge una volta sola.
const KEY = "isula:announcement";
const MAX_AGE_MS = 30_000;

export function queueAnnouncement(message: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ message, at: Date.now() }));
  } catch {
    // Storage bloccato (finestra privata, browser interno): l'annuncio manca, l'azione va comunque.
  }
}

export function clearAnnouncement() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nulla da cancellare se lo storage non è disponibile.
  }
}

export function takeAnnouncement(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    clearAnnouncement();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { message?: unknown; at?: unknown };
    if (typeof parsed.message !== "string" || typeof parsed.at !== "number") return null;
    return Date.now() - parsed.at <= MAX_AGE_MS ? parsed.message : null;
  } catch {
    return null;
  }
}
