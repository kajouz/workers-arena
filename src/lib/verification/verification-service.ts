/**
 * Verification Service
 * Handles email, phone, and WhatsApp OTP verification.
 *
 * In production, plug in Twilio (SMS), SendGrid (email), and WhatsApp Business API.
 * For demo/dev, codes are logged to console and stored in-memory.
 */

import { randomInt } from "crypto";

/* ─── Types ─── */
export type VerificationChannel = "email" | "phone" | "whatsapp";

export interface VerificationRequest {
  id: string;
  userId: string;
  channel: VerificationChannel;
  target: string; // email address or phone number
  code: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  verified: boolean;
}

export interface SendVerificationInput {
  userId: string;
  channel: VerificationChannel;
  target: string; // email or phone (E.164 format)
}

export interface VerifyCodeInput {
  userId: string;
  channel: VerificationChannel;
  code: string;
}

/* ─── In-memory store (demo) ─── */
const pendingVerifications = new Map<string, VerificationRequest>();
const verifiedChannels = new Map<string, Set<VerificationChannel>>();

/* ─── Helpers ─── */
function generateCode(): string {
  return String(randomInt(100000, 999999));
}

function getStoreKey(userId: string, channel: VerificationChannel): string {
  return `${userId}:${channel}`;
}

function isExpired(req: VerificationRequest): boolean {
  return new Date() > req.expiresAt;
}

/* ─── Send Verification ─── */
export async function sendVerification(
  input: SendVerificationInput
): Promise<{ success: boolean; requestId: string; expiresIn: number }> {
  const { userId, channel, target } = input;

  // Check rate limit — max 3 per 10 minutes per channel
  const recentKeys = Array.from(pendingVerifications.keys()).filter((k) =>
    k.startsWith(`${userId}:${channel}`)
  );
  const recentCount = recentKeys.filter((k) => {
    const req = pendingVerifications.get(k);
    return req && !isExpired(req) && !req.verified;
  }).length;

  if (recentCount >= 3) {
    throw new Error("Too many verification requests. Please wait 10 minutes.");
  }

  const code = generateCode();
  const id = `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  const request: VerificationRequest = {
    id,
    userId,
    channel,
    target,
    code,
    attempts: 0,
    maxAttempts: 5,
    createdAt: now,
    expiresAt,
    verified: false,
  };

  pendingVerifications.set(id, request);

  // Send via channel
  switch (channel) {
    case "email":
      await sendEmailVerification(target, code);
      break;
    case "phone":
      await sendSMSVerification(target, code);
      break;
    case "whatsapp":
      await sendWhatsAppVerification(target, code);
      break;
  }

  return { success: true, requestId: id, expiresIn: 600 }; // 10 min in seconds
}

/* ─── Verify Code ─── */
export async function verifyCode(
  input: VerifyCodeInput
): Promise<{ success: boolean; channel: VerificationChannel }> {
  const { userId, channel, code } = input;

  // Find the latest pending request for this user + channel
  const pending = Array.from(pendingVerifications.values())
    .filter(
      (r) =>
        r.userId === userId &&
        r.channel === channel &&
        !r.verified &&
        !isExpired(r)
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!pending) {
    throw new Error("No pending verification found. Please request a new code.");
  }

  if (isExpired(pending)) {
    throw new Error("Verification code expired. Please request a new code.");
  }

  if (pending.attempts >= pending.maxAttempts) {
    throw new Error("Too many failed attempts. Please request a new code.");
  }

  pending.attempts++;

  if (pending.code !== code) {
    throw new Error(
      `Invalid code. ${pending.maxAttempts - pending.attempts} attempts remaining.`
    );
  }

  // Mark verified
  pending.verified = true;
  const key = getStoreKey(userId, channel);
  if (!verifiedChannels.has(userId)) {
    verifiedChannels.set(userId, new Set());
  }
  verifiedChannels.get(userId)!.add(channel);

  return { success: true, channel };
}

/* ─── Check Verification Status ─── */
export function getVerificationStatus(
  userId: string
): Record<VerificationChannel, boolean> {
  const channels = verifiedChannels.get(userId);
  return {
    email: channels?.has("email") ?? false,
    phone: channels?.has("phone") ?? false,
    whatsapp: channels?.has("whatsapp") ?? false,
  };
}

/* ─── Channel Senders (demo mode — logs to console) ─── */
async function sendEmailVerification(email: string, code: string) {
  // Production: use SendGrid / Resend
  console.log(`[Verification] Email to ${email}: Your code is ${code}`);
  // In real app: await sendEmail({ to: email, subject: "Verify your email", body: `Code: ${code}` });
}

async function sendSMSVerification(phone: string, code: string) {
  // Production: use Twilio
  console.log(`[Verification] SMS to ${phone}: Your code is ${code}`);
  // In real app: await twilio.messages.create({ to: phone, body: `Your WorkersArena code: ${code}` });
}

async function sendWhatsAppVerification(phone: string, code: string) {
  // Production: use WhatsApp Business API
  console.log(`[Verification] WhatsApp to ${phone}: Your code is ${code}`);
}

/* ─── Phone Number Formatting ─── */
export function formatPhoneForDisplay(phone: string): string {
  // +961 71 123 456 → (+961) 71 123 456
  if (phone.startsWith("+")) {
    const code = phone.slice(1, 3);
    const rest = phone.slice(3);
    return `(+${code}) ${rest.replace(/(\d{2})(\d{3})(\d{3})/, "$1 $2 $3")}`;
  }
  return phone;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${"*".repeat(3)}@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4);
}
