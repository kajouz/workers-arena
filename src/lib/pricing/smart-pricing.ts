/**
 * Smart Pricing Engine — demand-based, rush hour, and holiday multipliers.
 *
 * Computes a dynamic price multiplier for lead pricing based on:
 * 1. Time of day (rush hour vs off-peak)
 * 2. Day of week (weekend premium)
 * 3. Seasonal demand (summer AC rush, winter heating)
 * 4. Holidays (Eid, Christmas, New Year — reduced availability)
 * 5. Local supply/demand ratio (category availability in the city)
 *
 * The multiplier is applied ON TOP of the base lead price from the
 * fee engine — it never replaces the admin-set base prices, only
 * adjusts them dynamically.
 */

export interface SmartPricingContext {
  /** Current date/time. */
  now: Date;
  /** Worker's category slug (e.g. "plumbing", "hvac"). */
  categorySlug: string;
  /** Worker's city slug (e.g. "beirut"). */
  citySlug: string;
  /** Number of available workers in this category+city right now. */
  availableWorkers: number;
  /** Number of pending leads for this category+city in the last hour. */
  pendingLeads: number;
  /** Emergency requests receive a bounded after-hours dispatch premium. */
  isEmergency?: boolean;
}

export interface SmartPricingResult {
  /** Final multiplier (1.0 = no adjustment). */
  multiplier: number;
  /** Breakdown of each factor. */
  factors: {
    rushHour: number;
    weekend: number;
    seasonal: number;
    holiday: number;
    supplyDemand: number;
  };
  /** Human-readable reason for the adjustment. */
  reason: string;
}

// ─── Rush Hour ────────────────────────────────────────────────────

/** Rush hours: 7–9 AM and 5–8 PM (Beirut peak commute). */
function rushHourMultiplier(hour: number): number {
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)) return 1.15; // +15%
  if (hour >= 10 && hour <= 16) return 1.05; // +5% (business hours)
  return 0.95; // -5% (off-peak incentive)
}

// ─── Weekend ──────────────────────────────────────────────────────

function weekendMultiplier(dayOfWeek: number): number {
  if (dayOfWeek === 0) return 1.2; // Sunday (Lebanon work week starts Mon)
  if (dayOfWeek === 6) return 1.1; // Saturday
  return 1.0;
}

// ─── Seasonal ─────────────────────────────────────────────────────

/**
 * Seasonal demand patterns for Lebanon.
 * AC/heating categories surge in summer/winter; others are stable.
 */
function seasonalMultiplier(categorySlug: string, month: number): number {
  const slug = categorySlug.toLowerCase();

  // AC, satellite (summer install season), cooling.
  if (["hvac", "satellite"].includes(slug)) {
    if (month >= 5 && month <= 9) return 1.25; // Summer: +25%
    if (month >= 3 && month <= 4 || month >= 10 && month <= 11) return 1.1; // Shoulder
    return 0.9; // Winter: -10%
  }

  // Roofing, insulation (dry season preferred).
  if (["roofing", "insulation"].includes(slug)) {
    if (month >= 4 && month <= 10) return 1.15; // Dry season
    return 0.95; // Rainy season
  }

  // Plumbing (pipe bursts in winter).
  if (slug === "plumbing") {
    if (month >= 11 || month <= 2) return 1.15; // Winter
    return 1.0;
  }

  // Moving (peak in summer/September).
  if (slug === "movers") {
    if (month >= 6 && month <= 9) return 1.2; // Moving season
    return 0.95;
  }

  return 1.0; // Stable categories.
}

// ─── Holidays ─────────────────────────────────────────────────────

/** Lebanese holidays that reduce worker availability. */
const HOLIDAYS = [
  { month: 1, day: 1, name: "New Year" },
  { month: 1, day: 6, name: "Epiphany" },
  { month: 2, day: 14, name: "Valentine's Day" },
  { month: 3, day: 25, name: "Annunciation" },
  { month: 4, day: 7, name: "Easter" }, // Approximate — varies.
  { month: 5, day: 1, name: "Labour Day" },
  { month: 5, day: 25, name: "Resistance Liberation Day" },
  { month: 6, day: 5, name: "Martyrs' Day" },
  { month: 8, day: 15, name: "Assumption Day" },
  { month: 10, day: 1, name: "Independence Day" },
  { month: 12, day: 25, name: "Christmas" },
];

function holidayMultiplier(now: Date): { multiplier: number; name: string | null } {
  const month = now.getMonth() + 1;
  const day = now.getDate();

  for (const h of HOLIDAYS) {
    if (h.month === month && Math.abs(h.day - day) <= 1) {
      return { multiplier: 1.3, name: h.name }; // +30% on/near holidays
    }
  }

  // Eid al-Fitr / Eid al-Adha (approximate dates — lunar calendar shifts).
  // These are the biggest holidays in Lebanon. For now, use fixed windows.
  const dateStr = `${month}-${day}`;
  if (["3-30", "3-31", "4-1", "6-5", "6-6", "6-7", "6-8"].includes(dateStr)) {
    return { multiplier: 1.35, name: "Eid" }; // +35%
  }

  return { multiplier: 1.0, name: null };
}

// ─── Supply/Demand ────────────────────────────────────────────────

function supplyDemandMultiplier(available: number, pending: number): number {
  if (available === 0) return 1.5; // No workers: +50% (scarcity)
  if (pending === 0) return 0.95; // No pending leads: -5% (incentive)
  const ratio = pending / available;
  if (ratio > 3) return 1.2; // High demand: +20%
  if (ratio > 2) return 1.1; // Moderate demand: +10%
  if (ratio < 0.5) return 0.9; // Low demand: -10%
  return 1.0;
}

// ─── Main ─────────────────────────────────────────────────────────

/**
 * Compute the smart pricing multiplier for a lead in this context.
 * Returns a multiplier centered around 1.0 (no adjustment).
 */
export function computeSmartPricing(
  ctx: SmartPricingContext
): SmartPricingResult {
  const hour = ctx.now.getHours();
  const dayOfWeek = ctx.now.getDay();
  const month = ctx.now.getMonth() + 1;

  const rushHour = rushHourMultiplier(hour);
  const weekend = weekendMultiplier(dayOfWeek);
  const seasonal = seasonalMultiplier(ctx.categorySlug, month);
  const holiday = holidayMultiplier(ctx.now);
  const supplyDemand = supplyDemandMultiplier(ctx.availableWorkers, ctx.pendingLeads);
  const emergency = ctx.isEmergency ? 1.5 : 1.0;

  // Geometric mean of all factors (avoids over-stacking). Emergency is a
  // deliberate dispatch premium, bounded by the global 2.0 cap below.
  const raw =
    rushHour * weekend * seasonal * holiday.multiplier * supplyDemand * emergency;

  // Clamp to [0.7, 2.0] — no more than -30% discount or +100% surge.
  const multiplier = Math.round(Math.min(2.0, Math.max(0.7, raw)) * 100) / 100;

  // Build reason string.
  const reasons: string[] = [];
  if (rushHour !== 1.0) reasons.push(rushHour > 1 ? "rush hour" : "off-peak");
  if (weekend !== 1.0) reasons.push("weekend");
  if (seasonal !== 1.0) reasons.push(seasonal > 1 ? "peak season" : "off-season");
  if (holiday.name) reasons.push(holiday.name);
  if (supplyDemand !== 1.0) reasons.push(supplyDemand > 1 ? "high demand" : "low demand");
  if (emergency !== 1.0) reasons.push("emergency dispatch");

  return {
    multiplier,
    factors: { rushHour, weekend, seasonal, holiday: holiday.multiplier, supplyDemand },
    reason: reasons.length > 0 ? reasons.join(", ") : "base rate",
  };
}
