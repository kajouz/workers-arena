/**
 * Haptic feedback utility for Capacitor mobile apps.
 * Provides tactile feedback for user interactions.
 * Falls back to no-op on web.
 */

let hapticsAvailable = false;

export async function initHaptics(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      hapticsAvailable = true;
    }
  } catch {
    // Not in Capacitor
  }
}

/**
 * Light haptic feedback — for selections, toggles, small interactions.
 */
export async function hapticLight(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Plugin not available
  }
}

/**
 * Medium haptic feedback — for button presses, confirmations.
 */
export async function hapticMedium(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Plugin not available
  }
}

/**
 * Heavy haptic feedback — for important actions, errors.
 */
export async function hapticHeavy(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    // Plugin not available
  }
}

/**
 * Success haptic — for completed actions.
 */
export async function hapticSuccess(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Plugin not available
  }
}

/**
 * Warning haptic — for cautionary actions.
 */
export async function hapticWarning(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // Plugin not available
  }
}

/**
 * Error haptic — for failed actions.
 */
export async function hapticError(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Plugin not available
  }
}

/**
 * Selection changed haptic — for picker/wheel interactions.
 */
export async function hapticSelection(): Promise<void> {
  if (!hapticsAvailable) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionStart();
  } catch {
    // Plugin not available
  }
}
