/**
 * Masked Number Service — Privacy-Preserving Call Routing
 *
 * Generates temporary platform numbers for workers and customers.
 * Both parties see a masked number; the system routes calls without
 * revealing real phone numbers. Numbers expire after job completion
 * or a defined period (default: 7 days after booking ends).
 *
 * Uses Prisma for persistence in production, in-memory store for demo mode.
 */

import { getPrisma } from "@/lib/server/prisma";

// ─── Types ────────────────────────────────────────────────────────────────

export interface MaskedNumber {
  id: string;
  /** The temporary platform number shown to the caller */
  maskedNumber: string;
  /** The real phone number (encrypted in production) */
  realNumber: string;
  /** Who this number belongs to */
  partyType: "worker" | "customer";
  /** The booking this number is linked to */
  bookingId: string;
  /** Worker real number (for routing incoming calls) */
  workerRealNumber: string;
  /** Customer real number (for routing incoming calls) */
  customerRealNumber: string;
  /** When this number was created */
  createdAt: Date;
  /** When this number expires and becomes inactive */
  expiresAt: Date;
  /** Whether this number is currently active */
  isActive: boolean;
  /** Number of calls made through this masked number */
  callCount: number;
  /** Last time this number was used */
  lastUsedAt?: Date;
}

export interface CallRecord {
  id: string;
  maskedNumberId: string;
  /** Who initiated the call */
  callerPartyType: "worker" | "customer";
  /** Real duration in seconds */
  durationSeconds: number;
  /** Whether the call was answered */
  wasAnswered: boolean;
  /** Call start time */
  startedAt: Date;
  /** Call end time */
  endedAt: Date;
}

export interface CreateMaskedNumberInput {
  workerId: string;
  customerId?: string; // null for guest bookings
  customerPhone: string;
  bookingId: string;
  /** Days until expiration (default: 7) */
  expirationDays?: number;
}

export type MaskedNumberPublic = Omit<MaskedNumber, "realNumber" | "workerRealNumber" | "customerRealNumber">;

// ─── Platform Number Pool ─────────────────────────────────────────────────

/**
 * In production, these would be real Twilio/Vonage numbers.
 * For demo mode, we generate predictable masked numbers.
 */
const PLATFORM_NUMBERS = [
  "+1-800-555-0101",
  "+1-800-555-0102",
  "+1-800-555-0103",
  "+1-800-555-0104",
  "+1-800-555-0105",
  "+1-800-555-0106",
  "+1-800-555-0107",
  "+1-800-555-0108",
  "+1-800-555-0109",
  "+1-800-555-0110",
];

// ─── In-Memory Store (Demo Mode) ──────────────────────────────────────────

const maskedNumbersStore = new Map<string, MaskedNumber>();
const callRecordsStore = new Map<string, CallRecord>();

let platformNumberIndex = 0;

// ─── Helper Functions ─────────────────────────────────────────────────────

function generateMaskedId(): string {
  return `MN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateCallId(): string {
  return `CL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAvailablePlatformNumber(): string {
  const number = PLATFORM_NUMBERS[platformNumberIndex % PLATFORM_NUMBERS.length];
  platformNumberIndex++;
  return number;
}

// ─── Core Service Functions ───────────────────────────────────────────────

/**
 * Create masked numbers for both worker and customer for a booking.
 * Returns both masked numbers so the UI can display them.
 */
export async function createMaskedNumbers(
  input: CreateMaskedNumberInput
): Promise<{ workerMasked: MaskedNumber; customerMasked: MaskedNumber }> {
  const { customerId, customerPhone, bookingId, expirationDays = 7 } = input;

  // Get worker and customer real numbers from the booking
  const bookingInfo = await getBookingForMaskedNumber(bookingId);
  if (!bookingInfo) {
    throw new Error("Booking not found or missing phone numbers");
  }

  const workerRealNumber = bookingInfo.workerPhone;
  const customerRealNumber = customerPhone || bookingInfo.customerPhone;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expirationDays * 24 * 60 * 60 * 1000);

  // In production, use Prisma; in demo mode, use in-memory store
  if (process.env.DEMO_MODE === "false") {
    // Create worker's masked number
    const workerMasked = await getPrisma().maskedNumber.create({
      data: {
        maskedNumber: getAvailablePlatformNumber(),
        realNumber: workerRealNumber,
        partyType: "worker",
        bookingId,
        workerRealNumber,
        customerRealNumber,
        expiresAt,
        isActive: true,
        callCount: 0,
      },
    });

    // Create customer's masked number
    const customerMasked = await getPrisma().maskedNumber.create({
      data: {
        maskedNumber: getAvailablePlatformNumber(),
        realNumber: customerRealNumber,
        partyType: "customer",
        bookingId,
        workerRealNumber,
        customerRealNumber,
        expiresAt,
        isActive: true,
        callCount: 0,
      },
    });

    return {
      workerMasked: mapPrismaToMaskedNumber(workerMasked),
      customerMasked: mapPrismaToMaskedNumber(customerMasked),
    };
  }

  // Demo mode: use in-memory store
  const workerMaskedNumber: MaskedNumber = {
    id: generateMaskedId(),
    maskedNumber: getAvailablePlatformNumber(),
    realNumber: workerRealNumber,
    partyType: "worker",
    bookingId,
    workerRealNumber,
    customerRealNumber,
    createdAt: now,
    expiresAt,
    isActive: true,
    callCount: 0,
  };

  const customerMaskedNumber: MaskedNumber = {
    id: generateMaskedId(),
    maskedNumber: getAvailablePlatformNumber(),
    realNumber: customerRealNumber,
    partyType: "customer",
    bookingId,
    workerRealNumber,
    customerRealNumber,
    createdAt: now,
    expiresAt,
    isActive: true,
    callCount: 0,
  };

  maskedNumbersStore.set(workerMaskedNumber.id, workerMaskedNumber);
  maskedNumbersStore.set(customerMaskedNumber.id, customerMaskedNumber);

  return { workerMasked: workerMaskedNumber, customerMasked: customerMaskedNumber };
}

/**
 * Get the masked number for a specific party in a booking.
 */
export async function getMaskedNumberForBooking(
  bookingId: string,
  partyType: "worker" | "customer"
): Promise<MaskedNumberPublic | null> {
  if (process.env.DEMO_MODE === "false") {
    const masked = await getPrisma().maskedNumber.findFirst({
      where: {
        bookingId,
        partyType,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (!masked) return null;
    return stripSensitiveFields(mapPrismaToMaskedNumber(masked));
  }

  // Demo mode
  for (const mn of maskedNumbersStore.values()) {
    if (mn.bookingId === bookingId && mn.partyType === partyType && mn.isActive) {
      if (new Date() >= mn.expiresAt) {
        mn.isActive = false;
        return null;
      }
      return stripSensitiveFields(mn);
    }
  }
  return null;
}

/**
 * Get the real phone number for a masked number (admin only).
 */
export async function getRealNumberForMasked(
  maskedNumberId: string
): Promise<{ realNumber: string; partyType: string; bookingId: string } | null> {
  if (process.env.DEMO_MODE === "false") {
    const masked = await getPrisma().maskedNumber.findUnique({
      where: { id: maskedNumberId },
    });
    if (!masked) return null;
    return {
      realNumber: masked.realNumber,
      partyType: masked.partyType,
      bookingId: masked.bookingId,
    };
  }

  // Demo mode
  const masked = maskedNumbersStore.get(maskedNumberId);
  if (!masked) return null;
  return {
    realNumber: masked.realNumber,
    partyType: masked.partyType,
    bookingId: masked.bookingId,
  };
}

/**
 * Route an incoming call through the masked number system.
 * Returns the real number to forward the call to.
 */
export async function routeIncomingCall(
  maskedNumber: string
): Promise<{ forwardTo: string; callId: string } | null> {
  if (process.env.DEMO_MODE === "false") {
    const masked = await getPrisma().maskedNumber.findFirst({
      where: {
        maskedNumber,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (!masked) return null;

    // Create call record
    const callRecord = await getPrisma().callRecord.create({
      data: {
        maskedNumberId: masked.id,
        callerPartyType: masked.partyType === "worker" ? "customer" : "worker",
        durationSeconds: 0,
        wasAnswered: false,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    // Update usage stats
    await getPrisma().maskedNumber.update({
      where: { id: masked.id },
      data: {
        callCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    const forwardTo = masked.partyType === "worker" ? masked.workerRealNumber : masked.customerRealNumber;
    return { forwardTo, callId: callRecord.id };
  }

  // Demo mode
  for (const mn of maskedNumbersStore.values()) {
    if (mn.maskedNumber === maskedNumber && mn.isActive) {
      if (new Date() >= mn.expiresAt) {
        mn.isActive = false;
        return null;
      }

      const callRecord: CallRecord = {
        id: generateCallId(),
        maskedNumberId: mn.id,
        callerPartyType: mn.partyType === "worker" ? "customer" : "worker",
        durationSeconds: 0,
        wasAnswered: false,
        startedAt: new Date(),
        endedAt: new Date(),
      };

      callRecordsStore.set(callRecord.id, callRecord);

      mn.callCount++;
      mn.lastUsedAt = new Date();

      const forwardTo = mn.partyType === "worker" ? mn.workerRealNumber : mn.customerRealNumber;
      return { forwardTo, callId: callRecord.id };
    }
  }
  return null;
}

/**
 * End a call and update the record.
 */
export async function endCall(
  callId: string,
  durationSeconds: number,
  wasAnswered: boolean
): Promise<void> {
  if (process.env.DEMO_MODE === "false") {
    await getPrisma().callRecord.update({
      where: { id: callId },
      data: {
        durationSeconds,
        wasAnswered,
        endedAt: new Date(),
      },
    });
    return;
  }

  // Demo mode
  const call = callRecordsStore.get(callId);
  if (call) {
    call.durationSeconds = durationSeconds;
    call.wasAnswered = wasAnswered;
    call.endedAt = new Date();
  }
}

/**
 * Release (deactivate) masked numbers for a booking.
 * Called when booking is completed or cancelled.
 */
export async function releaseMaskedNumbers(bookingId: string): Promise<void> {
  if (process.env.DEMO_MODE === "false") {
    await getPrisma().maskedNumber.updateMany({
      where: { bookingId },
      data: { isActive: false },
    });
    return;
  }

  // Demo mode
  for (const mn of maskedNumbersStore.values()) {
    if (mn.bookingId === bookingId) {
      mn.isActive = false;
    }
  }
}

/**
 * Get all masked numbers for admin management (with real numbers).
 */
export async function getAllMaskedNumbers(): Promise<MaskedNumber[]> {
  if (process.env.DEMO_MODE === "false") {
    const maskedNumbers = await getPrisma().maskedNumber.findMany({
      orderBy: { createdAt: "desc" },
    });
    return maskedNumbers.map(mapPrismaToMaskedNumber);
  }

  // Demo mode
  return Array.from(maskedNumbersStore.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Get public masked numbers (without real numbers) for a booking.
 */
export async function getMaskedNumbersForBooking(
  bookingId: string
): Promise<{ worker: MaskedNumberPublic | null; customer: MaskedNumberPublic | null }> {
  const worker = await getMaskedNumberForBooking(bookingId, "worker");
  const customer = await getMaskedNumberForBooking(bookingId, "customer");
  return { worker, customer };
}

/**
 * Get call statistics for a booking.
 */
export async function getCallStatsForBooking(bookingId: string): Promise<{
  totalCalls: number;
  answeredCalls: number;
  totalDurationSeconds: number;
  averageCallDuration: number;
}> {
  if (process.env.DEMO_MODE === "false") {
    const calls = await getPrisma().callRecord.findMany({
      where: {
        maskedNumber: { bookingId },
      },
    });

    const answeredCalls = calls.filter((c) => c.wasAnswered);
    const totalDuration = calls.reduce((sum: number, c: { durationSeconds: number }) => sum + c.durationSeconds, 0);

    return {
      totalCalls: calls.length,
      answeredCalls: answeredCalls.length,
      totalDurationSeconds: totalDuration,
      averageCallDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
    };
  }

  // Demo mode
  const calls = Array.from(callRecordsStore.values()).filter((c) => {
    const masked = maskedNumbersStore.get(c.maskedNumberId);
    return masked?.bookingId === bookingId;
  });

  const answeredCalls = calls.filter((c) => c.wasAnswered);
  const totalDuration = calls.reduce((sum: number, c: { durationSeconds: number }) => sum + c.durationSeconds, 0);

  return {
    totalCalls: calls.length,
    answeredCalls: answeredCalls.length,
    totalDurationSeconds: totalDuration,
    averageCallDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
  };
}

/**
 * Check and expire old masked numbers.
 * Should be called periodically (e.g., via cron).
 */
export async function expireOldMaskedNumbers(): Promise<number> {
  if (process.env.DEMO_MODE === "false") {
    const result = await getPrisma().maskedNumber.updateMany({
      where: {
        isActive: true,
        expiresAt: { lte: new Date() },
      },
      data: { isActive: false },
    });
    return result.count;
  }

  // Demo mode
  let expiredCount = 0;
  const now = new Date();

  for (const mn of maskedNumbersStore.values()) {
    if (mn.isActive && now >= mn.expiresAt) {
      mn.isActive = false;
      expiredCount++;
    }
  }

  return expiredCount;
}

/**
 * Reset all stores (for testing only).
 */
export function resetStores(): void {
  maskedNumbersStore.clear();
  callRecordsStore.clear();
  platformNumberIndex = 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripSensitiveFields(mn: MaskedNumber): MaskedNumberPublic {
  const { realNumber: _, workerRealNumber: __, customerRealNumber: ___, ...publicFields } = mn;
  return publicFields;
}

function mapPrismaToMaskedNumber(prismaMasked: any): MaskedNumber {
  return {
    id: prismaMasked.id,
    maskedNumber: prismaMasked.maskedNumber,
    realNumber: prismaMasked.realNumber,
    partyType: prismaMasked.partyType as "worker" | "customer",
    bookingId: prismaMasked.bookingId,
    workerRealNumber: prismaMasked.workerRealNumber,
    customerRealNumber: prismaMasked.customerRealNumber,
    createdAt: prismaMasked.createdAt,
    expiresAt: prismaMasked.expiresAt,
    isActive: prismaMasked.isActive,
    callCount: prismaMasked.callCount,
    lastUsedAt: prismaMasked.lastUsedAt,
  };
}

async function getBookingForMaskedNumber(bookingId: string): Promise<{
  workerPhone: string;
  customerPhone: string;
} | null> {
  // In demo mode, return mock data; in production, query the database
  if (bookingId.startsWith("BK-")) {
    return { workerPhone: "+961 71 123 456", customerPhone: "+961 70 123 456" };
  }
  return null;
}
