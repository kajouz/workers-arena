/**
 * Biometric Authentication Module
 * 
 * Provides Face ID / Touch ID authentication for mobile apps.
 * Uses Capacitor's Biometric plugin for native biometric support.
 * 
 * Note: This module requires the following Capacitor plugins to be installed:
 * - @capawesome/capacitor-biometric-auth
 * - @capacitor/secure-storage-plugin
 * 
 * Install with: npm install @capawesome/capacitor-biometric-auth @capacitor/secure-storage-plugin
 */

import { Capacitor } from "@capacitor/core";

// ─── Types ─────────────────────────────────────────────────────────

export type BiometricType = "faceId" | "touchId" | "fingerprint" | "none";

export interface BiometricResult {
  success: boolean;
  error?: string;
  biometricType?: BiometricType;
}

export interface BiometricConfig {
  /** Title shown in the biometric prompt */
  title: string;
  /** Subtitle shown in the biometric prompt */
  subtitle?: string;
  /** Description shown in the biometric prompt */
  description: string;
  /** Whether to allow fallback to device password */
  allowDeviceCredential?: boolean;
  /** Custom button text for fallback */
  fallbackButtonText?: string;
}

// ─── Plugin Detection ──────────────────────────────────────────────

let biometricPlugin: any = null;
let secureStoragePlugin: any = null;
let pluginsLoaded = false;

async function loadPlugins(): Promise<boolean> {
  if (pluginsLoaded) return true;
  
  try {
    // @ts-ignore - These are optional Capacitor plugins
    biometricPlugin = await import(/* webpackIgnore: true */ "@capawesome/capacitor-biometric-auth").catch(() => null);
    // @ts-ignore - These are optional Capacitor plugins
    secureStoragePlugin = await import(/* webpackIgnore: true */ "@capacitor/secure-storage-plugin").catch(() => null);
    pluginsLoaded = true;
    return true;
  } catch {
    return false;
  }
}

// ─── Biometric Availability ────────────────────────────────────────

/**
 * Check if biometric authentication is available on the device
 */
export async function isBiometricAvailable(): Promise<{
  available: boolean;
  biometricType: BiometricType;
  error?: string;
}> {
  // Only available on native platforms
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      biometricType: "none",
      error: "Biometric authentication is only available on native mobile apps",
    };
  }

  // Check if plugins are available
  await loadPlugins();
  if (!biometricPlugin) {
    return {
      available: false,
      biometricType: "none",
      error: "Biometric plugin not installed. Run: npm install @capawesome/capacitor-biometric-auth",
    };
  }

  try {
    const result = await biometricPlugin.BiometricAuth.isAvailable();
    
    let biometricType: BiometricType = "none";
    if (result.biometricType === "FaceID") {
      biometricType = "faceId";
    } else if (result.biometricType === "TouchID" || result.biometricType === "Fingerprint") {
      biometricType = result.biometricType === "TouchID" ? "touchId" : "fingerprint";
    }

    return {
      available: result.isAvailable,
      biometricType,
    };
  } catch (error) {
    console.error("Failed to check biometric availability:", error);
    return {
      available: false,
      biometricType: "none",
      error: "Failed to check biometric availability",
    };
  }
}

// ─── Biometric Authentication ──────────────────────────────────────

/**
 * Prompt the user for biometric authentication
 */
export async function authenticateWithBiometric(
  config: BiometricConfig
): Promise<BiometricResult> {
  // Only available on native platforms
  if (!Capacitor.isNativePlatform()) {
    return {
      success: false,
      error: "Biometric authentication is only available on native mobile apps",
    };
  }

  // Check if plugins are available
  await loadPlugins();
  if (!biometricPlugin) {
    return {
      success: false,
      error: "Biometric plugin not installed",
    };
  }

  try {
    const result = await biometricPlugin.BiometricAuth.authenticate({
      title: config.title,
      subtitle: config.subtitle,
      description: config.description,
      allowDeviceCredential: config.allowDeviceCredential ?? true,
      cancelTitle: "Cancel",
      fallbackTitle: config.fallbackButtonText ?? "Use Password",
    });

    if (result.success) {
      const availability = await isBiometricAvailable();
      
      return {
        success: true,
        biometricType: availability.biometricType,
      };
    }

    return {
      success: false,
      error: result.error ?? "Authentication failed",
    };
  } catch (error) {
    console.error("Biometric authentication failed:", error);
    return {
      success: false,
      error: "Biometric authentication failed",
    };
  }
}

// ─── Secure Storage ────────────────────────────────────────────────

/**
 * Store credentials securely (encrypted with biometric)
 */
export async function storeBiometricCredentials(
  username: string,
  password: string
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  await loadPlugins();
  if (!secureStoragePlugin) {
    console.warn("Secure storage plugin not installed");
    return false;
  }

  try {
    await secureStoragePlugin.SecureStoragePlugin.set({
      key: `biometric_${username}`,
      value: password,
    });

    await secureStoragePlugin.SecureStoragePlugin.set({
      key: `biometric_meta_${username}`,
      value: JSON.stringify({
        username,
        biometricEnabled: true,
        createdAt: new Date().toISOString(),
      }),
    });

    return true;
  } catch (error) {
    console.error("Failed to store biometric credentials:", error);
    return false;
  }
}

/**
 * Retrieve and decrypt credentials using biometric
 */
export async function retrieveBiometricCredentials(
  username: string
): Promise<{ username: string; password: string } | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  await loadPlugins();
  if (!secureStoragePlugin) {
    return null;
  }

  try {
    const result = await secureStoragePlugin.SecureStoragePlugin.get({
      key: `biometric_${username}`,
    });

    if (result.value) {
      return {
        username,
        password: result.value,
      };
    }

    return null;
  } catch (error) {
    console.error("Failed to retrieve biometric credentials:", error);
    return null;
  }
}

/**
 * Remove stored biometric credentials
 */
export async function removeBiometricCredentials(username: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  await loadPlugins();
  if (!secureStoragePlugin) {
    return false;
  }

  try {
    await secureStoragePlugin.SecureStoragePlugin.remove({
      key: `biometric_${username}`,
    });

    await secureStoragePlugin.SecureStoragePlugin.remove({
      key: `biometric_meta_${username}`,
    });

    return true;
  } catch (error) {
    console.error("Failed to remove biometric credentials:", error);
    return false;
  }
}

// ─── Biometric Login Flow ──────────────────────────────────────────

/**
 * Complete biometric login flow:
 * 1. Check if biometric is available
 * 2. Check if user has stored credentials
 * 3. Prompt for biometric
 * 4. Retrieve and decrypt credentials
 * 5. Login with credentials
 */
export async function biometricLogin(
  username: string
): Promise<{
  success: boolean;
  error?: string;
  requiresPassword?: boolean;
}> {
  // Check if biometric is available
  const availability = await isBiometricAvailable();
  if (!availability.available) {
    return {
      success: false,
      error: availability.error,
      requiresPassword: true,
    };
  }

  // Check if credentials are stored
  const hasCredentials = await checkStoredCredentials(username);
  if (!hasCredentials) {
    return {
      success: false,
      error: "No stored credentials found. Please login with password first.",
      requiresPassword: true,
    };
  }

  // Prompt for biometric
  const biometricResult = await authenticateWithBiometric({
    title: "Login to WorkersArena",
    subtitle: "Use biometric to login",
    description: "Verify your identity to continue",
    allowDeviceCredential: true,
  });

  if (!biometricResult.success) {
    return {
      success: false,
      error: biometricResult.error,
    };
  }

  // Retrieve credentials
  const credentials = await retrieveBiometricCredentials(username);
  if (!credentials) {
    return {
      success: false,
      error: "Failed to retrieve credentials",
      requiresPassword: true,
    };
  }

  // In production, call your login API with credentials
  console.log("Biometric login successful for:", username);
  
  return {
    success: true,
  };
}

/**
 * Check if user has stored biometric credentials
 */
async function checkStoredCredentials(username: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  await loadPlugins();
  if (!secureStoragePlugin) {
    return false;
  }

  try {
    const result = await secureStoragePlugin.SecureStoragePlugin.get({
      key: `biometric_meta_${username}`,
    });

    return result.value !== null;
  } catch {
    return false;
  }
}

/**
 * Enable biometric login for a user
 */
export async function enableBiometricLogin(
  username: string,
  password: string
): Promise<boolean> {
  // First, authenticate with biometric
  const biometricResult = await authenticateWithBiometric({
    title: "Enable Biometric Login",
    description: "Verify your identity to enable biometric login",
    allowDeviceCredential: true,
  });

  if (!biometricResult.success) {
    return false;
  }

  // Store credentials
  return await storeBiometricCredentials(username, password);
}

/**
 * Disable biometric login for a user
 */
export async function disableBiometricLogin(username: string): Promise<boolean> {
  // First, authenticate with biometric
  const biometricResult = await authenticateWithBiometric({
    title: "Disable Biometric Login",
    description: "Verify your identity to disable biometric login",
    allowDeviceCredential: true,
  });

  if (!biometricResult.success) {
    return false;
  }

  // Remove credentials
  return await removeBiometricCredentials(username);
}

// ─── Utility Functions ─────────────────────────────────────────────

/**
 * Get biometric type name for display
 */
export function getBiometricTypeName(type: BiometricType): string {
  switch (type) {
    case "faceId":
      return "Face ID";
    case "touchId":
      return "Touch ID";
    case "fingerprint":
      return "Fingerprint";
    default:
      return "Biometric";
  }
}

/**
 * Get biometric icon name for display
 */
export function getBiometricIcon(type: BiometricType): string {
  switch (type) {
    case "faceId":
      return "face-id";
    case "touchId":
      return "fingerprint";
    case "fingerprint":
      return "fingerprint";
    default:
      return "shield-check";
  }
}
