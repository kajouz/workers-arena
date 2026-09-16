/**
 * Share Sheet — wraps @capacitor/share for native and navigator.share for web.
 * Falls back to clipboard copy if neither is available.
 */

export interface ShareOptions {
  title: string;
  text: string;
  url?: string;
}

/** Share content via the platform's native share sheet. */
export async function shareContent(options: ShareOptions): Promise<boolean> {
  // Try Capacitor Share first (native).
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return true;
    }
  } catch {
    // Not in Capacitor or user cancelled — fall through.
  }

  // Try Web Share API (mobile browsers, Chrome on Android).
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return true;
    } catch {
      // User cancelled or not supported — fall through.
    }
  }

  // Fallback: copy to clipboard.
  try {
    const text = [options.text, options.url].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Share a worker profile. */
export async function shareWorkerProfile(slug: string, name: string): Promise<boolean> {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/workers/${slug}`;
  return shareContent({
    title: `${name} — WorkersArena`,
    text: `Check out ${name} on WorkersArena`,
    url,
  });
}

/** Share a completed job (for worker's portfolio). */
export async function shareCompletedJob(bookingNumber: string, jobTitle: string): Promise<boolean> {
  return shareContent({
    title: `Job Completed — ${bookingNumber}`,
    text: `Just completed: ${jobTitle} on WorkersArena`,
    url: typeof window !== "undefined" ? window.location.origin : undefined,
  });
}
