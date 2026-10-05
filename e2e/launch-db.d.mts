export function demoRowCounts(databaseUrl: string): Promise<{
  activities: number;
  places: number;
  itineraries: number;
  local_tips: number;
  activity_offers: number;
}>;
