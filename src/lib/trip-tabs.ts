// Schede della pagina del viaggio (brief 6.1). Modulo puro: lo importano sia la pagina server sia il
// builder client (un valore esportato da un file "use client" arriva al server come riferimento client).
export const TRIP_TABS = ["itinerario", "prenotare", "gruppo"] as const;
export type TripTab = (typeof TRIP_TABS)[number];
