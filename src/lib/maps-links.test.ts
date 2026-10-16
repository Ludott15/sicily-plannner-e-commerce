import { describe, expect, it } from "vitest";
import { mapsLinks } from "./maps-links";

describe("mapsLinks", () => {
  it("senza coordinate non ci sono link", () => {
    expect(mapsLinks(null, 15, "Noto")).toBeNull();
    expect(mapsLinks(37, null, "Noto")).toBeNull();
    expect(mapsLinks(Number.NaN, 15, "Noto")).toBeNull();
  });

  it("costruisce i link di Google Maps e Mappe di Apple", () => {
    expect(mapsLinks(36.8925, 14.9936, "Noto")).toEqual({
      google: "https://www.google.com/maps/search/?api=1&query=36.8925,14.9936",
      apple: "https://maps.apple.com/?ll=36.8925,14.9936&q=Noto",
    });
  });

  it("codifica il nome della tappa per Apple", () => {
    const links = mapsLinks(37.5, 15.1, "Pranzo & granita, via Roma");
    expect(links?.apple).toBe("https://maps.apple.com/?ll=37.5,15.1&q=Pranzo%20%26%20granita%2C%20via%20Roma");
  });
});
