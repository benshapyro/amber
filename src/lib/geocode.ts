import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { geocodeCache } from "@/db/schema";
import { env } from "./env";

// Three decimals is about 110 m: close enough for a place name, and each
// spot is looked up once. Only the coordinate is sent, nothing else.
export function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

type MapboxFeature = {
  properties?: {
    name?: string;
    feature_type?: string;
    context?: Record<string, { name?: string } | undefined>;
  };
};

export function placeNameFrom(feature: MapboxFeature | undefined): string | null {
  const p = feature?.properties;
  if (!p?.name) return null;
  const parts = [p.name];
  const place = p.context?.place?.name;
  if (place && place !== p.name) parts.push(place);
  const country = p.context?.country?.name;
  if (country && country !== p.name) parts.push(country);
  return parts.join(", ");
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = env.mapboxToken;
  if (!token) return null;

  const key = cacheKey(lat, lng);
  const db = getDb();
  const [hit] = await db.select().from(geocodeCache).where(eq(geocodeCache.key, key));
  if (hit) return hit.placeName;

  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("latitude", lat.toFixed(5));
  url.searchParams.set("longitude", lng.toFixed(5));
  url.searchParams.set("types", "neighborhood,locality,place");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  if (!res.ok) return null; // try again next time rather than cache a miss
  const body = (await res.json()) as { features?: MapboxFeature[] };
  const placeName = placeNameFrom(body.features?.[0]);
  await db.insert(geocodeCache).values({ key, placeName }).onConflictDoNothing();
  return placeName;
}
