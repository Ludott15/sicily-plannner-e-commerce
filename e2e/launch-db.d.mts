export function demoRowCounts(databaseUrl: string): Promise<{
  activities: number;
  places: number;
  itineraries: number;
  local_tips: number;
  local_tip_authors: number;
  activity_offers: number;
}>;
