/**
 * ────────────────────────────────────────────────────────────────────────────
 * CONTACT GUARD — direct contact details stay private until a booking
 * ────────────────────────────────────────────────────────────────────────────
 * Revenue plan Step 5. Profiles used to show every worker's phone, WhatsApp and
 * email to anyone, so a customer could find a worker here and hire them off the
 * platform: no booking, no commission, no review, no guarantee. It also made
 * the paid lead market pointless — why buy a lead the customer can skip?
 *
 * Now:
 *   • Public pages and public APIs pass workers through `publicWorker`, which
 *     blanks the contact fields. Hiding the buttons is not enough: the whole
 *     `Worker` object is serialised into the page for the client components, so
 *     the number would still be in the HTML.
 *   • The customer gets the worker's number after booking, from the existing
 *     release rules (`/api/calling/contact-details`, masked calling for urgent
 *     jobs).
 *   • The WhatsApp button goes to WorkersArena's own business number, with a
 *     pre-filled message naming the worker or the trade and place. The team
 *     turns it into a booking, so the job stays on the platform.
 *     `NEXT_PUBLIC_WHATSAPP_NUMBER` is that number; without it the button is
 *     not shown (a WhatsApp link to nobody is worse than no button).
 */

import type { Worker } from "./types";

/** The fields that let a customer reach a worker without the platform. */
export const PRIVATE_CONTACT_FIELDS = ["phone", "whatsapp", "email", "website"] as const;

/** Social links that are really a phone line (Instagram and the like stay). */
const MESSAGING_SOCIAL = /whatsapp|telegram|viber|signal|phone|sms|wa\.me|t\.me|tel:/i;

type ContactFields = Pick<Worker, (typeof PRIVATE_CONTACT_FIELDS)[number] | "socials">;

/** A worker safe to show to the public: the direct-contact fields are blank. */
export function publicWorker<T extends ContactFields>(worker: T): T {
  return {
    ...worker,
    phone: "",
    whatsapp: "",
    email: "",
    website: undefined,
    socials: (worker.socials ?? []).filter((s) => !MESSAGING_SOCIAL.test(`${s.platform} ${s.url}`)),
  };
}

/** `publicWorker` over a list. */
export function publicWorkers<T extends ContactFields>(workers: readonly T[]): T[] {
  return workers.map(publicWorker);
}

/**
 * The platform's WhatsApp number as wa.me wants it (digits only, no "+"), or
 * null when it is not configured or not a plausible international number.
 * Takes the raw value so tests can pass one; defaults to the build-time env.
 */
export function platformWhatsAppNumber(raw: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export interface WhatsAppRequestInput {
  locale: "en" | "ar";
  /** A specific worker the customer wants ("I'd like to book Karim"). */
  workerName?: string;
  /** The worker's profile link, so the team knows exactly who. */
  profileUrl?: string;
  /** The trade the customer needs ("plumber"). */
  trade?: string;
  /** Where ("Achrafieh, Beirut"). */
  place?: string;
}

/** The pre-filled message a customer sends to WorkersArena on WhatsApp. */
export function whatsappRequestMessage(input: WhatsAppRequestInput): string {
  const { locale, workerName, profileUrl, trade, place } = input;
  if (locale === "ar") {
    const what = workerName
      ? `أرغب في حجز ${workerName}`
      : `أحتاج ${trade ?? "عاملاً"}${place ? ` في ${place}` : ""}`;
    return [`مرحباً وركرز أرينا، ${what}.`, profileUrl, "الوظيفة: "].filter(Boolean).join("\n");
  }
  const what = workerName
    ? `I'd like to book ${workerName}`
    : `I need a ${trade ?? "tradesperson"}${place ? ` in ${place}` : ""}`;
  return [`Hi WorkersArena, ${what}.`, profileUrl, "The job: "].filter(Boolean).join("\n");
}

/**
 * The wa.me link to WorkersArena's number with the request pre-filled, or null
 * when no platform number is configured (callers then hide the button).
 */
export function whatsappRequestHref(input: WhatsAppRequestInput, number = platformWhatsAppNumber()): string | null {
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(whatsappRequestMessage(input))}`;
}
