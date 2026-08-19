import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.workersarena.app",
  appName: "WorkersArena",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      // iOS: how notifications appear when the app is in the foreground
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1a1a2e",
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#1a1a2e",
      showSpinner: true,
      spinnerColor: "#FF5722",
    },
    App: {
      // Handle URL schemes for deep linking
      // Universal Links (iOS) and App Links (Android) are configured
      // in the native projects (ios/ and android/ directories)
    },
  },
};

export default config;
