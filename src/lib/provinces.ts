// Sigle delle nove province siciliane (places.province) e nome per il percorso di navigazione.
export const PROVINCES: Record<string, string> = {
  AG: "Agrigento",
  CL: "Caltanissetta",
  CT: "Catania",
  EN: "Enna",
  ME: "Messina",
  PA: "Palermo",
  RG: "Ragusa",
  SR: "Siracusa",
  TP: "Trapani",
};

export function provinceName(code: string): string {
  return PROVINCES[code] ?? code;
}
