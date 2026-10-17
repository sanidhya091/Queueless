import * as Location from 'expo-location';

import { supabase } from './supabase';

export type Coordinate = { latitude: number; longitude: number };
export type MapRegion = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Place = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

export type LocatedPlace = Place & {
  coordinate: Coordinate;
  coordinateSource: 'stored' | 'geocoded';
};

export const JABALPUR_REGION: MapRegion = {
  latitude: 23.1815,
  longitude: 79.9864,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const PLACE_COLUMNS =
  'id, name, category, address, city, latitude, longitude';
const MAX_MAP_PLACES = 200;
const MAX_UNLOCATED_PLACES = 50;
const MAX_NEW_GEOCODES = 8;
const geocodeCache = new Map<
  string,
  { coordinate: Coordinate | null; expiresAt: number }
>();
const cityCache = new Map<string, string | null>();

export function toCoordinate(
  latitude: unknown,
  longitude: unknown
): Coordinate | null {
  if (
    typeof latitude !== 'number' || typeof longitude !== 'number' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) return null;

  return { latitude, longitude };
}

export function distanceKm(a: Coordinate, b: Coordinate) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
    Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function regionForCoordinate(coordinate: Coordinate): MapRegion {
  return { ...coordinate, latitudeDelta: 0.12, longitudeDelta: 0.12 };
}

export function getAreaBounds(region: MapRegion) {
  // Pad a city-scale viewport; cap very large zoom-outs rather than reading
  // the entire places table. Zooming/panning exposes "Search this area".
  const halfLat = Math.min(0.5, Math.max(0.06, region.latitudeDelta * 0.75));
  const halfLon = Math.min(0.5, Math.max(0.06, region.longitudeDelta * 0.75));
  return {
    south: Math.max(-90, region.latitude - halfLat),
    north: Math.min(90, region.latitude + halfLat),
    west: region.longitude - halfLon,
    east: region.longitude + halfLon,
  };
}

export function isInArea(coordinate: Coordinate, region: MapRegion) {
  const bounds = getAreaBounds(region);
  return coordinate.latitude >= bounds.south &&
    coordinate.latitude <= bounds.north &&
    coordinate.longitude >= bounds.west &&
    coordinate.longitude <= bounds.east;
}

export function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function cityForArea(region: MapRegion, canGeocode: boolean) {
  // This is the documented fallback city, not a coordinate for an office.
  if (distanceKm(region, JABALPUR_REGION) < 40) return 'Jabalpur';
  if (!canGeocode) return null;

  const key = `${region.latitude.toFixed(2)},${region.longitude.toFixed(2)}`;
  if (cityCache.has(key)) return cityCache.get(key) || null;

  try {
    const results = await withTimeout(Location.reverseGeocodeAsync(region), 8000);
    const city = results[0]?.city || null;
    cityCache.set(key, city);
    return city;
  } catch {
    return null;
  }
}

function geocodeKey(place: Place) {
  // Changing a place's address invalidates the cached lookup automatically.
  return `${place.id}:${place.name}:${place.address || ''}:${place.city}`;
}

async function resolvePlaceCoordinate(place: Place) {
  const key = geocodeKey(place);
  const query = [place.name.trim(), place.address?.trim(), place.city.trim()]
    .filter(Boolean).join(', ');
  let coordinate: Coordinate | null = null;

  try {
    const results = await withTimeout(Location.geocodeAsync(query), 8000);
    // Ambiguous matches or city-level results are not reliable office pins.
    if (results.length === 1 &&
      (results[0].accuracy === undefined || results[0].accuracy <= 1000)) {
      coordinate = toCoordinate(results[0].latitude, results[0].longitude);
    }
  } catch {
    // Missing/failed lookups must not take down map discovery.
  }

  if (geocodeCache.size >= 500) geocodeCache.clear();
  geocodeCache.set(key, {
    coordinate,
    expiresAt: Date.now() + (coordinate ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000),
  });
  return coordinate;
}

export async function fetchMapPlaces(
  region: MapRegion,
  canGeocode: boolean,
  signal: AbortSignal,
  onStoredPlaces?: (places: LocatedPlace[]) => void
) {
  const bounds = getAreaBounds(region);
  const { data, error } = await supabase
    .from('places')
    .select(PLACE_COLUMNS)
    .gte('latitude', bounds.south)
    .lte('latitude', bounds.north)
    .gte('longitude', bounds.west)
    .lte('longitude', bounds.east)
    .order('id', { ascending: true })
    .limit(MAX_MAP_PLACES + 1)
    .abortSignal(signal);

  if (error) throw error;
  if (signal.aborted) throw new Error('Map request cancelled');
  const rows = (data || []) as Place[];
  const located: LocatedPlace[] = [];

  for (const place of rows.slice(0, MAX_MAP_PLACES)) {
    const coordinate = toCoordinate(place.latitude, place.longitude);
    if (coordinate) located.push({ ...place, coordinate, coordinateSource: 'stored' });
  }
  onStoredPlaces?.(located);

  const city = await cityForArea(region, canGeocode);
  let unresolved = 0;
  let limited = rows.length > MAX_MAP_PLACES;
  if (!city || signal.aborted) return { places: located, unresolved, limited };

  const missingResponse = await supabase
    .from('places')
    .select(PLACE_COLUMNS)
    .ilike('city', city.replace(/[\\%_]/g, '\\$&'))
    .or('latitude.is.null,longitude.is.null')
    .order('id', { ascending: true })
    .limit(MAX_UNLOCATED_PLACES + 1)
    .abortSignal(signal);

  if (missingResponse.error) throw missingResponse.error;
  const missing = (missingResponse.data || []) as Place[];
  limited = limited || missing.length > MAX_UNLOCATED_PLACES;
  let attempts = 0;

  // Sequential and bounded: do not flood the device geocoder. Cached failures
  // are also reused, so refreshes do not continuously retry bad addresses.
  for (const place of missing.slice(0, MAX_UNLOCATED_PLACES)) {
    if (signal.aborted) break;
    const cached = geocodeCache.get(geocodeKey(place));
    let coordinate = cached && cached.expiresAt > Date.now()
      ? cached.coordinate : null;
    const hasFreshCache = cached && cached.expiresAt > Date.now();

    if (!hasFreshCache && canGeocode && attempts < MAX_NEW_GEOCODES) {
      attempts += 1;
      coordinate = await resolvePlaceCoordinate(place);
    }

    if (coordinate && isInArea(coordinate, region)) {
      located.push({ ...place, coordinate, coordinateSource: 'geocoded' });
    } else if (!coordinate) {
      unresolved += 1;
    }
  }

  return { places: located, unresolved, limited };
}
