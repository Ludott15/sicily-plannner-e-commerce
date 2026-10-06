export function demoRowCounts(databaseUrl: string): Promise<{
  activities: number;
  places: number;
  itineraries: number;
  local_tips: number;
  local_tip_authors: number;
  activity_offers: number;
  media: number;
}>;

export function imageLaunchProblems(databaseUrl: string): Promise<{
  featuredWithoutPhoto: string[];
  itinerariesWithoutPhoto: string[];
  publicMediaWithoutAlt: string[];
  licensedWithoutCredit: string[];
  heritageWithoutAuthorization: string[];
  areasWithoutIllustration: string[];
  placesWithoutArea: string[];
}>;
