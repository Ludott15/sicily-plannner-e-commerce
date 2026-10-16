// Costanti condivise dall'app installabile (passo 11.3). Nessun accesso al database né import
// server-only: il file è importato sia dal server (azione di uscita) sia dal client (registrazione
// del service worker).

// Identificatore di "nessun utente" per il service worker: con questo valore non si salva nessuna pagina
// di viaggio. Gli utenti sono identificati da un hash SHA-256 del loro id (mai l'id in chiaro).
export const ANONYMOUS_SESSION = "anon";

// Chiave di localStorage per "Non ora" nell'invito all'installazione (per sempre, per questo browser).
export const INSTALL_DISMISSED_KEY = "isula.install.dismissed";

// Quanti viaggi tenere leggibili offline (il service worker tiene i più recenti).
export const OFFLINE_TRIPS_LIMIT = 5;
