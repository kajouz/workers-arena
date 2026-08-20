/**
 * Geolocation Service
 * Handles location detection, distance calculation, and radius-based filtering.
 */

/* ─── Types ─── */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RadiusFilter {
  center: GeoLocation;
  radiusKm: number;
}

/* ─── Haversine Distance ─── */
export function haversineDistance(
  a: GeoLocation,
  b: GeoLocation
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/* ─── Format Distance ─── */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

/* ─── Get User Location ─── */
export function getUserLocation(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location access denied. Please enable location in your browser settings."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information unavailable. Please try again."));
            break;
          case error.TIMEOUT:
            reject(new Error("Location request timed out. Please try again."));
            break;
          default:
            reject(new Error("An unknown error occurred while getting your location."));
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 min cache
      }
    );
  });
}

/* ─── Watch Location ─── */
export function watchLocation(
  callback: (location: GeoLocation) => void,
  onError?: (error: GeolocationPositionError) => void
): () => void {
  if (!navigator.geolocation) {
    onError?.({ code: 0, message: "Geolocation not supported", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      callback({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    onError,
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/* ─── Filter by Radius ─── */
export function filterByRadius<T extends GeoLocation>(
  items: T[],
  center: GeoLocation,
  radiusKm: number
): (T & { distance: number })[] {
  return items
    .map((item) => ({
      ...item,
      distance: haversineDistance(center, item),
    }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

/* ─── City Approximate Coordinates ─── */
export const CITY_COORDINATES: Record<string, GeoLocation> = {
  riyadh: { latitude: 24.7136, longitude: 46.6753 },
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  abudhabi: { latitude: 24.4539, longitude: 54.3773 },
  doha: { latitude: 25.2854, longitude: 51.531 },
  kuwait: { latitude: 29.3759, longitude: 47.9774 },
  manama: { latitude: 26.2285, longitude: 50.586 },
  muscat: { latitude: 23.588, longitude: 58.3829 },
  amman: { latitude: 31.9454, longitude: 35.9284 },
  beirut: { latitude: 33.8938, longitude: 35.5018 },
  cairo: { latitude: 30.0444, longitude: 31.2357 },
  casablanca: { latitude: 33.5731, longitude: -7.5898 },
};

/* ─── Radius Presets ─── */
export const RADIUS_PRESETS = [
  { value: 2, label: "2 km" },
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: 100, label: "100 km" },
] as const;
