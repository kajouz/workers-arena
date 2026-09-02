/**
 * Push Notification Server
 * 
 * Handles:
 * - Token registration and storage
 * - Push notification delivery
 * - Token cleanup and refresh
 * - Batch notifications
 * - Notification preferences
 */

import { 
  registerPushSubscription,
  unregisterPushSubscription,
  getPushSubscriptions,
  listPushSubscriptions,
  forceRemovePushSubscription,
  clearPushSubscriptions,
  storeAdapterMode
} from "@/lib/notifications/push-store";
import type { PushSubscriptionJson } from "@/lib/notifications/push-store";

// ─── Types ─────────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
}

export interface SendOptions {
  userId?: string;
  ownerId?: string;
  payload: NotificationPayload;
  platform?: "ios" | "android" | "web";
  priority?: "high" | "normal";
  ttl?: number; // Time to live in seconds
}

export interface SendResult {
  success: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
}

// ─── Token Management ──────────────────────────────────────────────

/**
 * Register a push subscription
 */
export async function registerPushToken(subscription: PushSubscriptionJson): Promise<boolean> {
  return registerPushSubscription(subscription);
}

/**
 * Unregister a push subscription
 */
export async function unregisterPushToken(endpoint: string, ownerId?: string): Promise<boolean> {
  return unregisterPushSubscription(endpoint, ownerId);
}

/**
 * Get all active subscriptions
 */
export async function getAllPushTokens(): Promise<PushSubscriptionJson[]> {
  return getPushSubscriptions();
}

/**
 * Get subscription listing (admin view)
 */
export async function getPushTokenList() {
  return listPushSubscriptions();
}

// ─── Notification Delivery ─────────────────────────────────────────

/**
 * Send push notification to a specific subscription
 */
export async function sendToSubscription(
  subscription: PushSubscriptionJson,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // In production, use web-push library
    // For now, log the notification
    console.log("[Push Server] Sending notification:", {
      endpoint: subscription.endpoint.substring(0, 50) + "...",
      title: payload.title,
      body: payload.body,
    });

    return { success: true };
  } catch (error) {
    console.error("[Push Server] Failed to send notification:", error);
    return { success: false, error: "Failed to send notification" };
  }
}

/**
 * Send push notification to all subscriptions
 */
export async function sendBroadcast(payload: NotificationPayload): Promise<SendResult> {
  const subscriptions = await getAllPushTokens();
  
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const sub of subscriptions) {
    const result = await sendToSubscription(sub, payload);
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.error?.includes("invalid")) {
        invalidTokens.push(sub.endpoint);
      }
    }
  }

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    for (const endpoint of invalidTokens) {
      await forceRemovePushSubscription(endpoint);
    }
  }

  return {
    success: sent > 0,
    sent,
    failed,
    invalidTokens,
  };
}

/**
 * Send notification to subscriptions matching a filter
 */
export async function sendFiltered(
  payload: NotificationPayload,
  filter: (sub: PushSubscriptionJson) => boolean
): Promise<SendResult> {
  const subscriptions = await getAllPushTokens();
  const filtered = subscriptions.filter(filter);
  
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const sub of filtered) {
    const result = await sendToSubscription(sub, payload);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return {
    success: sent > 0,
    sent,
    failed,
    invalidTokens,
  };
}

// ─── Token Cleanup ─────────────────────────────────────────────────

/**
 * Remove a specific subscription
 */
export async function removeToken(endpoint: string): Promise<boolean> {
  return forceRemovePushSubscription(endpoint);
}

/**
 * Clear all subscriptions (admin only)
 */
export async function clearAllTokens(): Promise<void> {
  return clearPushSubscriptions();
}

/**
 * Get store adapter mode (for debugging)
 */
export function getStoreMode(): "file" | "prisma" {
  return storeAdapterMode();
}

// ─── Notification Helpers ──────────────────────────────────────────

/**
 * Create a booking notification payload
 */
export function createBookingNotification(params: {
  type: "created" | "confirmed" | "cancelled" | "completed";
  bookingId: string;
  workerName?: string;
  customerName?: string;
}): NotificationPayload {
  const { type, bookingId, workerName, customerName } = params;
  
  switch (type) {
    case "created":
      return {
        title: "New Booking Request",
        body: `You have a new booking request from ${customerName || "a customer"}`,
        data: { bookingId, type: "booking.created" },
        tag: `booking-${bookingId}`,
        requireInteraction: true,
      };
    case "confirmed":
      return {
        title: "Booking Confirmed",
        body: `Your booking with ${workerName || "the worker"} has been confirmed`,
        data: { bookingId, type: "booking.confirmed" },
        tag: `booking-${bookingId}`,
      };
    case "cancelled":
      return {
        title: "Booking Cancelled",
        body: `Booking ${bookingId} has been cancelled`,
        data: { bookingId, type: "booking.cancelled" },
        tag: `booking-${bookingId}`,
      };
    case "completed":
      return {
        title: "Booking Completed",
        body: `Booking ${bookingId} has been completed. Don't forget to leave a review!`,
        data: { bookingId, type: "booking.completed" },
        tag: `booking-${bookingId}`,
      };
  }
}

/**
 * Create an emergency notification payload
 */
export function createEmergencyNotification(params: {
  bookingId: string;
  customerName: string;
  jobTitle: string;
  maskedNumberReady: boolean;
}): NotificationPayload {
  return {
    title: "🚨 EMERGENCY — Urgent Service Request",
    body: `${params.customerName} needs immediate help: ${params.jobTitle}${params.maskedNumberReady ? " — Masked number ready for calling" : ""}`,
    data: { 
      bookingId: params.bookingId, 
      type: "emergency",
      maskedNumberReady: params.maskedNumberReady,
    },
    tag: `emergency-${params.bookingId}`,
    requireInteraction: true,
  };
}

/**
 * Create a message notification payload
 */
export function createMessageNotification(params: {
  bookingId: string;
  senderName: string;
  preview: string;
}): NotificationPayload {
  return {
    title: `Message from ${params.senderName}`,
    body: params.preview,
    data: { bookingId: params.bookingId, type: "message" },
    tag: `message-${params.bookingId}`,
  };
}
