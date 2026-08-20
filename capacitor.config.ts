import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.workersarena.app",
  appName: "WorkersArena",
  webDir: ".next",
  server: {
    // In production, point to deployed URL
    // url: "https://workersarena.com",
    // cleartext: false,
    
    // In development, use local server
    url: "http://localhost:3001",
    cleartext: true,
    androidScheme: "https",
  },
  
  // iOS specific
  ios: {
    contentInset: "automatic",
    backgroundColor: "#14120f",
    scheme: "WorkersArena",
    // bundleId is set in Xcode project
  },
  
  // Android specific
  android: {
    backgroundColor: "#14120f",
    allowMixedContent: true,
    captureInput: true,
    // packageName is set in build.gradle
  },
  
  // Deep linking
  plugins: {
    // Push Notifications
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    
    // App deeplinks
    App: {

    },
    
    // Splash Screen
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#14120f",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    
    // Status Bar
    StatusBar: {
      style: "DARK",
      backgroundColor: "#14120f",
      overlaysWebView: true,
    },
    
    // Keyboard
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    
    // Haptics
    Haptics: {
      // Default haptic feedback
    },
    
    // Local Notifications
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f97316",
    },
    
    // Biometrics
    BiometricAuth: {
      reason: "Authenticate to access your account",
      cancelTitle: "Cancel",
    },
  },
  
  // Build options
  build: {
    // Output directory for web assets
    webDir: ".next",
  },
};

export default config;
