import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.workersarena.app",
  appName: "WorkersArena",
  // In production builds, webDir points to the static export output.
  // For development with `cap run`, use the server.url option below.
  webDir: "out",
  server: {
    // M9 fix: env-driven so `cap run` in dev doesn't hit production by accident.
    // NEXT_PUBLIC_APP_URL is the same origin the web app uses.
    url: process.env.NEXT_PUBLIC_APP_URL ?? process.env.CAP_SERVER_URL ?? "https://workers-arena.vercel.app",
    cleartext: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("http://"),
    androidScheme: "https",
  },

  // iOS specific
  ios: {
    contentInset: "automatic",
    backgroundColor: "#14120f",
    scheme: "WorkersArena",
  },

  // Android specific
  android: {
    backgroundColor: "#14120f",
    allowMixedContent: false,
    captureInput: true,
  },

  // Deep linking
  // Plugins
  plugins: {
    // Push Notifications
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },

    // App deeplinks
    App: {},

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
      resize: "body" as any,
      resizeOnFullScreen: true,
    },

    // Local Notifications
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f97316",
    },
  },
};

export default config;
