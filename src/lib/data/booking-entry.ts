/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING ENTRY — turning a WhatsApp conversation into a real booking
 * ────────────────────────────────────────────────────────────────────────────
 * Customers in this market already talk to tradespeople on WhatsApp — that is
 * the channel the discovery happens in. The platform's WhatsApp was outbound
 * only (notifications and reminders), so a recommendation passed on in a chat
 * ended the same way a word-of-mouth recommendation has always ended: a phone
 * number, a message, and a job nobody records.
 *
 * This module is the other half. A booking link carries the INTENT — which
 * worker, which service, optionally which slot — so tapping it lands the
 * customer on the profile with the booking dialog already filled in. The
 * difference between "I know a plumber, let me find his number" and "tap this
 * and it is booked" is the whole funnel.
 *
 * ── Why the intent is validated, not merely forwarded ───────────────────────
 * A link is a URL: it can be edited, shared months ago, or point at a service
 * the worker has since renamed. Prefilling whatever the query string says would
 * put a stale price or a stranger's slot in front of a customer, and the server
 * action's re-check would then reject the booking *after* they filled the form —
 * the worst possible time to say no.
 *
 * So the entry is resolved against the live catalog and availability at render
 * time and anything unresolvable is DROPPED (with a reason), not rendered as a
 * half-filled dialog:
 *   • `unknown-service` — the service is not on this worker's catalog:
 *     prefill the job title only, and let the customer pick;
 *   • `slot-unavailable` / `slot-past` — the slot was taken or has started:
 *     open the dialog on the slot step and drop the selection.
 *
 * Either way the customer sees a working booking flow instead of an error. The
 * authoritative check still happens in the server action on submit; this is the
 * honest-prefill layer, not the guard.
 *
 * Pure: same link + same data ⇒ same intent.
 */

import type { BookingSlot, ServiceItem } from "./types";

/** Query params carried by a booking link. Short: they travel in chat messages. */
export const ENTRY_SERVICE_PARAM = "book";
export const ENTRY_SLOT_PARAM = "slot";
/** Where the link came from (`whatsapp`, `share`, `qr`, …) — for attribution. */
export const ENTRY_SOURCE_PARAM = "src";

/** Why a piece of the intent could not be used. */
export type EntryDropReason = "unknown-service" | "slot-unavailable" | "slot-past";

/** What the profile page hands to the booking dialog, already validated. */
export interface BookingEntryIntent {
  /** A service on THIS worker's catalog, or null when the link said nothing usable. */
  serviceNameEn: string | null;
  /** A slot that exists, is available, and has not started — or null. */
  slotId: string | null;
  /** Free-form provenance (`whatsapp`, `share`, …), trimmed and length-capped. */
  source: string | null;
  /** The first thing the link asked for that had to be dropped, if any. */
  dropped: { reason: EntryDropReason } | null;
  /** True when the link asked for nothing resolvable — the dialog just opens. */
  empty: boolean;
}

/** The intent for a plain profile visit (no entry params at all). */
export const EMPTY_ENTRY: BookingEntryIntent = {
  serviceNameEn: null,
  slotId: null,
  source: null,
  dropped: null,
  empty: true,
};

const MAX_SOURCE = 32;

/**
 * Resolve a booking link against the worker's live catalog and availability.
 *
 * `now` is injectable so the "has the slot already started" rule is testable;
 * callers pass the server render clock, exactly as the profile page does for
 * the SLA countdowns.
 */
export function resolveBookingEntry(input: {
  /** Raw `?book=` value (service `nameEn`), or null. */
  service?: string | null;
  /** Raw `?slot=` value, or null. */
  slotId?: string | null;
  /** Raw `?src=` value, or null. */
  source?: string | null;
  /** The worker's catalog, as the page renders it. */
  services: readonly ServiceItem[];
  /** The worker's slots, as the page renders them. */
  slots: readonly BookingSlot[];
  now?: number;
}): BookingEntryIntent {
  const wantedService = input.service?.trim() ?? "";
  const wantedSlot = input.slotId?.trim() ?? "";
  const source = (input.source?.trim() ?? "").slice(0, MAX_SOURCE) || null;
  const now = Number.isFinite(input.now) ? (input.now as number) : Date.now();

  let dropped: EntryDropReason | null = null;

  // The service must be one this worker actually sells. Compared on `nameEn`
  // because that is the stable join key the booking payload carries.
  let serviceNameEn: string | null = null;
  if (wantedService) {
    const match = input.services.find((s) => s.nameEn === wantedService);
    if (match) serviceNameEn = match.nameEn;
    else dropped = "unknown-service";
  }

  // The slot must exist, be AVAILABLE, and still be in the future. A link from
  // a chat thread can easily be days old.
  let slotId: string | null = null;
  if (wantedSlot) {
    const slot = input.slots.find((s) => s.id === wantedSlot);
    const startMs = slot ? Date.parse(slot.startAt) : Number.NaN;
    if (!slot || slot.status !== "available" || !Number.isFinite(startMs)) {
      // A malformed start time is not "in the past", it is unusable — and an
      // unusable slot must never be offered as a preselection either way.
      slotId = null;
      dropped ??= "slot-unavailable";
    } else if (startMs <= now) {
      slotId = null;
      dropped ??= "slot-past";
    } else {
      slotId = slot.id;
    }
  }

  const empty = serviceNameEn === null && slotId === null && source === null;
  return { serviceNameEn, slotId, source, dropped: dropped ? { reason: dropped } : null, empty };
}

/**
 * Build a shareable booking link for a worker (optionally for one service and
 * slot). Relative by default — the caller passes its own origin when it has
 * one, which is what makes the same helper work in a server page, a client
 * component and a test.
 */
export function buildBookingEntryUrl(input: {
  /** The worker profile path, e.g. `/en/workers/bilal-mansour-cleaning`. */
  path: string;
  serviceNameEn?: string | null;
  slotId?: string | null;
  source?: string | null;
  /** Optional absolute origin (`https://workersarena.com`). */
  origin?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.serviceNameEn) params.set(ENTRY_SERVICE_PARAM, input.serviceNameEn);
  if (input.slotId) params.set(ENTRY_SLOT_PARAM, input.slotId);
  if (input.source) params.set(ENTRY_SOURCE_PARAM, input.source.slice(0, MAX_SOURCE));
  const query = params.toString();
  const origin = input.origin?.replace(/\/+$/, "") ?? "";
  return `${origin}${input.path}${query ? `?${query}` : ""}`;
}

/**
 * The message a customer sends when they recommend a worker, in the language
 * they are using. Kept to one short paragraph: it is a WhatsApp message, and a
 * wall of text does not get forwarded.
 */
export function bookingEntryShareText(input: {
  workerName: string;
  serviceName?: string | null;
  url: string;
  locale: "en" | "ar";
}): string {
  const { workerName, serviceName, url, locale } = input;
  if (locale === "ar") {
    return serviceName
      ? `${workerName} موثوق على WorkersArena — احجز «${serviceName}» مباشرة من هذا الرابط: ${url}`
      : `${workerName} موثوق على WorkersArena — احجز موعدك مباشرة من هذا الرابط: ${url}`;
  }
  return serviceName
    ? `${workerName} is on WorkersArena — book "${serviceName}" straight from this link: ${url}`
    : `${workerName} is on WorkersArena — pick a time and book straight from this link: ${url}`;
}

/**
 * A `wa.me` share link for the recommendation above. Deliberately the SHARE
 * entry point (`wa.me/?text=…`) rather than a chat with the worker: the point is
 * passing the link on to whoever needs the job done, not messaging the
 * tradesperson.
 */
export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
