"use client";

import { useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

interface RetargetingEvent {
  type: "page_view" | "search" | "category_view" | "worker_view" | "booking_intent" | "bounce";
  data: Record<string, any>;
  timestamp: number;
}

interface RetargetingProfile {
  visitorId: string;
  events: RetargetingEvent[];
  interests: string[]; // Categories viewed
  cities: string[]; // Cities searched
  lastVisit: number;
  visitCount: number;
  bounced: boolean;
}

const STORAGE_KEY = "wa_retargeting";
const MAX_EVENTS = 50;
const BOUNCE_THRESHOLD_MS = 30000; // 30 seconds = bounce

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("wa_visitor_id");
  if (!id) {
    id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("wa_visitor_id", id);
  }
  return id;
}

function getProfile(): RetargetingProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveProfile(profile: RetargetingProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or unavailable
  }
}

function initProfile(): RetargetingProfile {
  return {
    visitorId: getVisitorId(),
    events: [],
    interests: [],
    cities: [],
    lastVisit: Date.now(),
    visitCount: 1,
    bounced: false,
  };
}

export function useRetargeting() {
  const pathname = usePathname();
  const pageLoadTime = useRef(Date.now());
  const hasTrackedPageView = useRef(false);

  // Track page view on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const profile = getProfile() ?? initProfile();
    profile.lastVisit = Date.now();
    profile.visitCount += 1;
    profile.bounced = false;

    const event: RetargetingEvent = {
      type: "page_view",
      data: { path: pathname },
      timestamp: Date.now(),
    };

    profile.events = [event, ...profile.events].slice(0, MAX_EVENTS);
    saveProfile(profile);
    hasTrackedPageView.current = true;

    // Track bounce on unmount if user left quickly
    return () => {
      const timeOnPage = Date.now() - pageLoadTime.current;
      if (timeOnPage < BOUNCE_THRESHOLD_MS) {
        const p = getProfile();
        if (p) {
          p.bounced = true;
          const bounceEvent: RetargetingEvent = {
            type: "bounce",
            data: { path: pathname, timeOnPage },
            timestamp: Date.now(),
          };
          p.events = [bounceEvent, ...p.events].slice(0, MAX_EVENTS);
          saveProfile(p);
        }
      }
    };
  }, [pathname]);

  // Track category interest
  const trackCategory = useCallback((category: string) => {
    const profile = getProfile() ?? initProfile();
    if (!profile.interests.includes(category)) {
      profile.interests = [category, ...profile.interests].slice(0, 10);
    }
    const event: RetargetingEvent = {
      type: "category_view",
      data: { category },
      timestamp: Date.now(),
    };
    profile.events = [event, ...profile.events].slice(0, MAX_EVENTS);
    saveProfile(profile);
  }, []);

  // Track city interest
  const trackCity = useCallback((city: string) => {
    const profile = getProfile() ?? initProfile();
    if (!profile.cities.includes(city)) {
      profile.cities = [city, ...profile.cities].slice(0, 5);
    }
    const event: RetargetingEvent = {
      type: "search",
      data: { city },
      timestamp: Date.now(),
    };
    profile.events = [event, ...profile.events].slice(0, MAX_EVENTS);
    saveProfile(profile);
  }, []);

  // Track worker view
  const trackWorkerView = useCallback((workerId: string, category: string, city: string) => {
    const profile = getProfile() ?? initProfile();
    if (!profile.interests.includes(category)) {
      profile.interests = [category, ...profile.interests].slice(0, 10);
    }
    if (!profile.cities.includes(city)) {
      profile.cities = [city, ...profile.cities].slice(0, 5);
    }
    const event: RetargetingEvent = {
      type: "worker_view",
      data: { workerId, category, city },
      timestamp: Date.now(),
    };
    profile.events = [event, ...profile.events].slice(0, MAX_EVENTS);
    saveProfile(profile);
  }, []);

  // Track booking intent
  const trackBookingIntent = useCallback((workerId: string, service: string) => {
    const profile = getProfile() ?? initProfile();
    const event: RetargetingEvent = {
      type: "booking_intent",
      data: { workerId, service },
      timestamp: Date.now(),
    };
    profile.events = [event, ...profile.events].slice(0, MAX_EVENTS);
    saveProfile(profile);
  }, []);

  // Get retargeting profile for ad personalization
  const getRetargetingData = useCallback(() => {
    return getProfile();
  }, []);

  // Check if visitor should see retargeting ad
  const shouldShowRetargetingAd = useCallback(() => {
    const profile = getProfile();
    if (!profile) return false;
    
    // Show retargeting ad if:
    // 1. Visitor has viewed at least 2 pages
    // 2. OR visitor has bounced recently
    // 3. AND hasn't converted (no booking_intent in last 24h)
    const pageViews = profile.events.filter((e) => e.type === "page_view").length;
    const recentBookingIntent = profile.events.find(
      (e) => e.type === "booking_intent" && Date.now() - e.timestamp < 24 * 60 * 60 * 1000
    );
    
    return (pageViews >= 2 || profile.bounced) && !recentBookingIntent;
  }, []);

  return {
    trackCategory,
    trackCity,
    trackWorkerView,
    trackBookingIntent,
    getRetargetingData,
    shouldShowRetargetingAd,
  };
}
