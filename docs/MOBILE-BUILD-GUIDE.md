# Mobile Build Guide — WorkersArena (Capacitor)

WorkersArena uses [Capacitor](https://capacitorjs.com) to wrap the Next.js web app as a native iOS and Android application. The app loads from the live Vercel deployment (`https://workersarena.com`) so all server-side features (API routes, authentication, database) work identically to the web version.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 22 | Runtime |
| npm | ≥ 10 | Package manager |
| Xcode | ≥ 16 | iOS builds (macOS only) |
| Android Studio | Latest | Android builds |
| CocoaPods | ≥ 1.15 | iOS dependency manager |
| Java JDK | ≥ 17 | Android builds |

---

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Generate native assets (icons, splash screens, colors)
npm run cap:assets

# 3. Sync web assets with native platforms
npx cap sync

# 4. Open in IDE
npx cap open ios       # Opens Xcode
npx cap open android   # Opens Android Studio
```

---

## Building for iOS

### First-time setup

1. Install Xcode from the Mac App Store
2. Install CocoaPods: `sudo gem install cocoapods`
3. Open Xcode → Settings → Locations → ensure Command Line Tools is set
4. `cd ios/App && pod install`

### Development build (simulator)

```bash
npx cap sync ios
npx cap run ios --list    # List available simulators
npx cap run ios -p <simulator-id>
```

### Development build (physical device)

1. Connect iPhone via USB
2. In Xcode: select your device as the build target
3. Set your Apple Developer Team in Signing & Capabilities
4. `npx cap sync ios` then `npx cap open ios`
5. Press ▶️ to build and run

### Production build (TestFlight / App Store)

```bash
# Build the web assets
npm run build

# Sync to native
npx cap sync ios

# Open Xcode
npx cap open ios
```

In Xcode:
1. Select **Product → Archive**
2. Follow the distribution wizard (TestFlight or App Store)
3. Upload to App Store Connect

---

## Building for Android

### First-time setup

1. Install Android Studio
2. Open Android Studio → Settings → SDK Manager
3. Install Android SDK 34+ and Build Tools
4. Set `ANDROID_HOME` environment variable

### Development build (emulator)

```bash
npx cap sync android
npx cap run android --list    # List available emulators
npx cap run android -p <emulator-id>
```

### Development build (physical device)

1. Enable USB Debugging on the Android device (Developer Options)
2. Connect via USB
3. `npx cap sync android && npx cap open android`
4. Press ▶️ to build and run

### Production build (Google Play)

```bash
# Build the web assets
npm run build

# Sync to native
npx cap sync android

# Open Android Studio
npx cap open android
```

In Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. Create or select a keystore file
3. Choose **Release** build variant
4. Upload the `.aab` file to Google Play Console

---

## Architecture

### How it works

```
┌─────────────────────────────────────────────────┐
│  Native Shell (iOS / Android)                    │
│  ┌─────────────────────────────────────────────┐ │
│  │  WebView                                    │ │
│  │  ┌───────────────────────────────────────┐  │ │
│  │  │  Next.js App (loaded from Vercel)     │  │ │
│  │  │  • Full server-side rendering          │  │ │
│  │  │  • API routes (Prisma → PostgreSQL)   │  │ │
│  │  │  • Authentication (cookies)            │  │ │
│  │  │  • Push notifications (via Capacitor)  │  │ │
│  │  └───────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  Native Plugins                             │ │
│  │  • Push Notifications                       │ │
│  │  • Status Bar                               │ │
│  │  • Keyboard                                 │ │
│  │  • Network Detection                        │ │
│  │  • Haptics                                  │ │
│  │  • Local Notifications                      │ │
│  │  • Geolocation                              │ │
│  │  • Camera                                   │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Key design decisions

- **Hybrid rendering**: The app loads from `https://workersarena.com`, so all Next.js server features (SSR, API routes, middleware) work identically to the web version
- **Native plugins**: Capacitor bridges native features (push notifications, status bar, keyboard) that aren't available in a browser
- **Offline support**: The service worker caches shell assets and key pages for offline viewing (same PWA as web)
- **Dynamic imports**: All Capacitor imports are dynamic, so the web bundle remains tree-shakeable and doesn't load native code when running in a browser

---

## Plugins Used

| Plugin | Package | Purpose |
|--------|---------|---------|
| App | `@capacitor/app` | App lifecycle, deep links |
| Browser | `@capacitor/browser` | Open external URLs |
| Camera | `@capacitor/camera` | Photo capture |
| Clipboard | `@capacitor/clipboard` | Copy to clipboard |
| Device | `@capacitor/device` | Device info |
| Geolocation | `@capacitor/geolocation` | Location services |
| Haptics | `@capacitor/haptics` | Vibration feedback |
| Keyboard | `@capacitor/keyboard` | Keyboard resize, style |
| Local Notifications | `@capacitor/local-notifications` | Scheduled reminders |
| Network | `@capacitor/network` | Connectivity status |
| Push Notifications | `@capacitor/push-notifications` | FCM/APNs push |
| Share | `@capacitor/share` | Native share sheet |
| Splash Screen | `@capacitor/splash-screen` | Launch splash |
| Status Bar | `@capacitor/status-bar` | Status bar style |

---

## Troubleshooting

### Build fails with "No such module 'CapacitorCommon'"
```bash
cd ios/App && pod install && cd ../..
```

### Android build fails with "Could not resolve @capacitor/core"
```bash
npx cap sync android
```

### iOS: "App cannot run in Simulator"
Check that your Xcode version matches your macOS version.

### White screen on launch
The app loads from `https://workersarena.com`. Ensure:
1. The device has internet access
2. The URL is not blocked by a firewall
3. The server is returning HTTP 200

### Push notifications not working
1. iOS: Ensure push entitlements are configured in Xcode
2. Android: Ensure `google-services.json` is in `android/app/`
3. Register the FCM/APNs token with your backend

---

## Configuration

The Capacitor config is at `capacitor.config.ts`:

```typescript
// Production URL (default)
server: {
  url: "https://workersarena.com",
  cleartext: false,
}

// Local development (uncomment to use)
server: {
  url: "http://localhost:3001",
  cleartext: true,
}
```

To switch between production and local development, edit `capacitor.config.ts` and run `npx cap sync`.

---

## Environment Variables

Capacitor native builds don't use `.env` files. Environment-specific values should be configured in:
- **iOS**: Xcode → Info.plist or xcconfig files
- **Android**: `android/app/build.gradle` or `gradle.properties`

For the live URL approach, all environment variables are handled by the Vercel deployment.
