# WorkersArena Mobile App

This directory contains the Capacitor-based mobile app configuration for iOS and Android.

## Setup

### Prerequisites

- Node.js 18+
- For iOS: Xcode, CocoaPods
- For Android: Android Studio, JDK 11+

### Initial Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the Next.js app:
   ```bash
   npm run build
   ```

3. Initialize Capacitor:
   ```bash
   npx cap init "WorkersArena" "com.workersarena.app" --web-dir out
   ```

4. Add platforms:
   ```bash
   npx cap add ios
   npx cap add android
   ```

5. Sync web assets:
   ```bash
   npx cap sync
   ```

### Development

1. Start Next.js dev server:
   ```bash
   npm run dev
   ```

2. In another terminal, sync and open:
   ```bash
   # iOS
   npm run cap:open:ios

   # Android
   npm run cap:open:android
   ```

### Production Build

1. Build for production:
   ```bash
   npm run cap:build
   ```

2. Open in native IDE:
   ```bash
   # iOS
   npm run cap:open:ios

   # Android
   npm run cap:open:android
   ```

3. Archive and submit to App Store / Google Play

## Plugins

- **Push Notifications**: `@capacitor/push-notifications`
- **Status Bar**: `@capacitor/status-bar`
- **Splash Screen**: `@capacitor/splash-screen`
- **Haptics**: `@capacitor/haptics`
- **Keyboard**: `@capacitor/keyboard`

## Features

- Native push notifications
- Offline-first with service worker
- Native splash screen
- Status bar theming
- Haptic feedback
- Keyboard handling

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [iOS Development Guide](https://capacitorjs.com/docs/ios)
- [Android Development Guide](https://capacitorjs.com/docs/android)
