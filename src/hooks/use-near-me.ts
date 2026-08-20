"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getUserLocation,
  watchLocation,
  haversineDistance,
  formatDistance,
  RADIUS_PRESETS,
  type GeoLocation,
  type RadiusFilter,
} from "@/lib/geolocation/geo-service";

export interface UseNearMeReturn {
  /** Current user location */
  location: GeoLocation | null;
  /** Whether location is being fetched */
  loading: boolean;
  /** Error message if location fetch failed */
  error: string | null;
  /** Selected radius in km */
  radiusKm: number;
  /** Whether "Near Me" mode is active */
  active: boolean;
  /** Set radius */
  setRadiusKm: (km: number) => void;
  /** Toggle Near Me on/off */
  toggle: () => void;
  /** Request location permission */
  requestLocation: () => Promise<void>;
  /** Calculate distance from user to a point */
  getDistance: (target: GeoLocation) => number | null;
  /** Format distance for display */
  formatDist: (km: number) => string;
  /** Available radius presets */
  presets: typeof RADIUS_PRESETS;
}

export function useNearMe(): UseNearMeReturn {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [active, setActive] = useState(false);
  const [watchStop, setWatchStop] = useState<(() => void) | null>(null);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      watchStop?.();
    };
  }, [watchStop]);

  const requestLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getUserLocation();
      setLocation(loc);
      setActive(true);

      // Start watching for changes
      const stop = watchLocation(
        (newLoc) => setLocation(newLoc),
        (err) => {
          console.warn("Watch location error:", err);
        }
      );
      setWatchStop(() => stop);
    } catch (err) {
      setError((err as Error).message);
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      setActive(false);
      watchStop?.();
      setWatchStop(null);
    } else if (location) {
      setActive(true);
    } else {
      requestLocation();
    }
  }, [active, location, watchStop, requestLocation]);

  const getDistance = useCallback(
    (target: GeoLocation): number | null => {
      if (!location) return null;
      return haversineDistance(location, target);
    },
    [location]
  );

  return {
    location,
    loading,
    error,
    radiusKm,
    active,
    setRadiusKm,
    toggle,
    requestLocation,
    getDistance,
    formatDist: formatDistance,
    presets: RADIUS_PRESETS,
  };
}
