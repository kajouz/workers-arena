# WorkersArena — Mobile Architecture (iOS & Android)

> Companion to `docs/PRODUCT.md` §5 (mobile plan). This doc is the engineering playbook for the **Capacitor path** (M2): one codebase (the existing Next.js app), native shells for iOS + Android, native push via FCM/APNs, deep-link routing, and the store-launch checklist. Update it alongside `docs/PRODUCT.md` as M1–M4 land.

**Strategy recap** (from PRODUCT.md §5.1): M1 harden the PWA (offline shell) → **M2 wrap with Capacitor for App Store / Play Store presence** → M3 launch → M4 evaluate a React Native (Expo) re-implementation. This doc covers M2/M3 in engineering detail.

---

## 1. High-level architecture

```
┌───────────────────────────────┐     ┌───────────────────────────────┐
│  iOS app (Capacitor)          │     │  Android app (Capacitor)      │
│  WKWebView + native plugins   │     │  WebView + native plugins     │
│  APNs · universal links       │     │  FCM · app links              │
└───────────────┬───────────────┘     └───────────────┬───────────────┘
                └──────────────────┬──────────────────┘
                                   ▼
                     Next.js web app (same codebase)
              bundled web assets (offline shell) OR deployed URL
                                   ▼
              ┌──────────────────────────────────────────┐
              │  Notification seam (src/lib/notifications)│
              │  dispatch() → channels:                  │
              │    email · sms · whatsapp ·              │
              │    push: web-push (browser)              │
              │          fcm (Android)   ← new           │
              │          apns (iOS)      ← new           │
              └──────────────────────────────────────────┘
                                   ▼
        Backend: Prisma/PostgreSQL · Stripe · Cloudinary · Redis
```

**Key decisions**
- **One codebase, one API.** The app renders the same Next.js app. No API duplication; the existing REST routes + Server Actions are the mobile API.
- **Bundled web assets, remote API.** Ship the static export in the native shell (`webDir`) so the app boots offline (app-shell cached), while data calls go to the deployed backend. Swap strategy: `output: "export"` for the shell, `NEXT_PUBLIC_APP_URL` for the API base. (Alternative — point the WebView at the hosted URL — trades offline for always-fresh; not recommended for a marketplace.)
- **Native push replaces web-push inside the app.** FCM (Android) + APNs (iOS) deliver notifications; the *in-app inbox* and the *dispatcher* stay exactly as they are today.
- **SDK-free providers.** Both FCM (HTTP v1) and APNs (HTTP/2) can be driven with plain `fetch` + node `crypto` (JWT signing) — matching the project's zero-SDK philosophy (the WhatsApp provider already does this).

---

## 2. Project layout

```text
workersarena/
├─ app/  src/  prisma/  public/      # existing Next.js web app (unchanged)
├─ mobile/                            # ← NEW: Capacitor workspace
│  ├─ capacitor.config.ts             # app id/name, webDir, plugins, server
│  ├─ package.json                    # @capacitor/core, /cli, /ios, /android
│  ├─ ios/                            # generated Xcode project (gitignored-ish)
│  ├─ android/                        # generated Android Studio project
│  └─ scripts/
│     ├─ sync.mjs                     # next build (export) → cap sync → open
│     └─ icons.mjs                    # @capacitor/assets generation
├─ src/lib/notifications/providers/
│  ├─ push.ts                         # existing web-push channel (unchanged)
│  ├─ fcm.ts                          # ← NEW: Android provider
│  └─ apns.ts                         # ← NEW: iOS provider
└─ scripts/                           # existing dev scripts
```

`mobile/capacitor.config.ts` (shape):

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.workersarena.app",
  appName: "WorkersArena",
  webDir: "../out",                     // static export of the Next.js app
  server: { androidScheme: "https" },   // secure WebView origin (required for
                                        // Service Worker + geolocation APIs)
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#f7f6f4" },
    PushNotifications: { presentationOptions: ["alert", "badge", "sound"] },
    DeepLinks: { /* universal links + app links, see §4 */ },
  },
};
export default config;
```

**Build/sync flow:** `next build && next export` → `npx cap sync` copies web assets + plugins into both native projects → build with Xcode / Android Studio (or EAS/GitHub Actions, §6).

> **M1 prerequisite (PWA hardening) ships first and is shared:** offline app-shell in `public/sw.js`, install prompt, iOS splash + `apple-touch-icon`, and deep-link friendly routes. None of that changes for Capacitor — the WebView reuses the same service worker.

---

## 3. Native push: FCM + APNs in the notification seam

### 3.1 The seam today (what stays)

```ts
// src/lib/notifications/types.ts
interface NotificationChannel {
  readonly id: string;                                   // "push"
  readonly provider: string;                             // "web-push" | "fcm" | "apns"
  send(payload: ChannelPayload): Promise<DispatchResult>;
}
interface ChannelPayload {
  id: string; type: string;
  titleEn: string; titleAr: string;
  bodyEn: string; bodyAr: string;
  href?: string; time: string;                          // href = deep-link target
  recipient?: { name?: string; email?: string; phone?: string; locale?: "en" | "ar" };
  meta?: Record<string, string>;
}
interface DispatchResult { channel: string; ok: boolean; provider: string; error?: string; }
```

- `src/lib/notifications/dispatcher.ts` — `dispatch(payload)` fans out to every enabled channel, `Promise.allSettled`, never throws.
- `src/lib/notifications/config.ts` — env selects providers; channels are **off in prod unless explicitly enabled** (safety posture to keep).
- `push.ts` — `createPushChannel()` returns `WebPushChannel` (VAPID) or `ConsolePushChannel`.

### 3.2 Config: explicit native provider selection

Extend `config.ts` so the push channel is chosen by name instead of only `hasVapidKeys()`:

```ts
export type PushProviderName = "console" | "web-push" | "fcm" | "apns";
// NOTIFY_PUSH_PROVIDER=web-push | fcm | apns   (default "console" in dev)
// FCM_* : Firebase project + service-account JSON (see 3.4)
// APNS_*: .p8 key + team/key ids (see 3.5)
```

`createPushChannel()` (in `push.ts`, or a small router) branches:

```ts
export function createPushChannel(): NotificationChannel {
  switch (process.env.NOTIFY_PUSH_PROVIDER?.toLowerCase()) {
    case "fcm":  return new FcmChannel();   // Android devices
    case "apns": return new ApnsChannel();  // iOS devices
    case "web-push": return new WebPushChannel();
    default:     return new ConsolePushChannel();
  }
}
```

One process can serve **both** platforms (a hybrid fleet) — treat the channel list as multi-instance: add a `getPushChannels()` that returns one channel per configured native provider plus web-push. `dispatch()` already handles N channels.

### 3.3 Device registration: tokens, not subscriptions

Today browsers POST a Web Push subscription (endpoint/p256dh/auth) to `/api/push/register` and the store dedupes on `endpoint`. Native apps register a **device token** instead:

- **New API shape** — extend `/api/push/register` to accept `{ platform: "web" | "android" | "ios", token?: string, subscription?: {...} }`.
- **Schema proposal** — add `platform` + `token` to `PushSubscription` (migration): keep `endpoint` unique for web rows; `token` unique for native rows; `device` already exists for the friendly label. The dual owner stamping (`ownerId` demo / `userId` FK) carries over unchanged — a signed-in user's devices belong to them; guests get `ownerId`.
- **Client side** — the app requests notification permission on first launch, registers with the OS (FCM/APNs SDK or Capacitor `PushNotifications` plugin), then POSTs the token. The admin push-subscription manager (`/admin/push-subscriptions`) lists both web and native devices.

### 3.4 FCM provider (`src/lib/notifications/providers/fcm.ts`) — Android

FCM HTTP v1 needs an OAuth2 access token minted from the Firebase service-account JSON (JWT → `https://oauth2.googleapis.com/token`), then a POST to `https://fcm.googleapis.com/v1/projects/{project_id}/messages`. **No firebase-admin SDK required** — node `crypto` signs the JWT (RS256).

```ts
class FcmChannel implements NotificationChannel {
  readonly id = "push";
  readonly provider = "fcm";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const tokens = await getNativeTokens("android");            // push-store query
      if (tokens.length === 0) return { channel: "push", ok: true, provider: "fcm" };
      const accessToken = await fcmAccessToken();                  // cached, ~1h TTL
      const message = {
        message: {
          token: "",   // per-token below
          notification: {
            title: payload.titleEn,                                // or locale-aware
            body: payload.bodyEn,
          },
          data: { url: payload.href ?? "/", type: payload.type, id: payload.id }, // tap routing
          android: { priority: "HIGH" },
        },
      };
      const results = await Promise.allSettled(tokens.map((t) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ ...message, message: { ...message.message, token: t } }),
        })
      ));
      // 404 (UNREGISTERED) tokens are pruned via the store, mirroring web-push pruning.
      return { channel: "push", ok: failures === 0, provider: "fcm", error: failures ? `${failures} failed` : undefined };
    } catch (err) { return { channel: "push", ok: false, provider: "fcm", error: String(err) }; }
  }
}
```

Env: `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT` (path to the JSON or inline), `NOTIFY_PUSH_PROVIDER=fcm`.

### 3.5 APNs provider (`src/lib/notifications/providers/apns.ts`) — iOS

APNs is an HTTP/2 POST to `https://api.push.apple.com/3/device/{token}` with a JWT (ES256) per request, signed with the `.p8` key. Node's `http2` + `crypto` do this with zero SDKs.

```ts
class ApnsChannel implements NotificationChannel {
  readonly id = "push";
  readonly provider = "apns";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const tokens = await getNativeTokens("ios");
      if (tokens.length === 0) return { channel: "push", ok: true, provider: "apns" };
      const jwt = apnsJwt();                       // ES256, cached until expiry
      const body = JSON.stringify({
        aps: {
          alert: { title: payload.titleEn, body: payload.bodyEn },
          sound: "default", badge: 1,
        },
        url: payload.href ?? "/",                  // tap routing → deep link
      });
      const results = await Promise.allSettled(tokens.map((token) =>
        postHttp2(`https://api.push.apple.com/3/device/${token}`, {
          ":method": "POST",
          authorization: `bearer ${jwt}`,
          "apns-topic": "com.workersarena.app",
          "apns-priority": "10",
        }, body)
      ));
      // 410 (Unregistered) → prune token; 400/403 → report (bad cert/token).
      return { channel: "push", ok: failures === 0, provider: "apns", error: failures ? `${failures} failed` : undefined };
    } catch (err) { return { channel: "push", ok: false, provider: "apns", error: String(err) }; }
  }
}
```

Env: `APNS_KEY_PATH` (.p8), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` (= app bundle id), `NOTIFY_PUSH_PROVIDER=apns`. Use the **sandbox** host (`api.sandbox.push.apple.com`) for dev builds.

### 3.6 Bilingual payloads

Web push already renders locale-aware title/body/dir/lang (`renderPushPayload`). FCM/APNs get the same treatment: `notification.title/body` from the recipient's locale, and `data` carries `locale` so the app can re-render in RTL if the OS locale differs. Badge counts should reflect the inbox unread count (already tracked).

### 3.7 Pruning + admin

Mirror the existing web-push hygiene:
- FCM 404 `UNREGISTERED` / APNs 410 → remove the token from the store and log to the admin activity feed (`ACTION_CODES.PUSH_SUBSCRIPTION_PRUNED`).
- Extend `/api/cron/push-prune` to probe native tokens too (a lightweight "ping" notification), keeping the same `CRON_SECRET` guard.
- Admin "Test send" (`sendTestPushSubscription`) gains a `platform` selector.

---

## 4. Deep-link routes

**Goal:** every path + notification `href` resolves both in the app and from the OS (tap a notification / scan a QR / open a shared link → app opens on the right screen).

### 4.1 Route map

| App path | Purpose | Notification hrefs that use it |
|---|---|---|
| `/` | Home | — |
| `/search?q=&category=&city=&area=&sort=` | Search (params preserved) | — |
| `/workers/[slug]` | Worker profile | lead, review, verification decisions |
| `/categories` | Trade directory | — |
| `/favorites` | Saved workers | — |
| `/notifications` | In-app inbox | verification submitted |
| `/dashboard` | Worker dashboard | subscription renewal / expiry |
| `/company` | Company dashboard | campaign status |
| `/admin`, `/admin/push-subscriptions` | Admin | admin alerts |
| `/auth/login` | Sign-in (redirect after) | — |

### 4.2 Routing layers

1. **In-app** — Next.js handles the path natively (it's the same web app).
2. **Notification taps** — web push: `sw.js` reads `data.url` and navigates. Native: FCM `data.url` / APNs `aps`-payload `url` are handed to the Capacitor `App`/`DeepLinks` plugin, which calls `window.location` (or `router.push`) on the WebView.
3. **OS links (cold start / QR / shared)** — iOS **Universal Links** (`https://workersarena.com/...` + `apple-app-site-association`) and Android **App Links** (`assetlinks.json`). Register `https://{NEXT_PUBLIC_APP_URL}/{path}` → app. QR codes already on profiles (`/workers/[slug]`) become install-bait: same URL opens the app when installed.

### 4.3 Capacitor wiring (sketch)

```ts
// mobile/src/deeplinks.ts (loaded by the web app when running inside Capacitor)
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";

App.addListener("appUrlOpen", ({ url }) => {
  const path = new URL(url).pathname + new URL(url).search; // "/workers/khaled-..." 
  window.history.replaceState({}, "", path);                 // RSC picks it up
});

PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
  const href = action.notification.data?.url ?? "/";
  window.location.href = href;
});
```

---

## 5. Store-launch checklist (M3)

From PRODUCT.md §5.4 — expanded into an actionable checklist.

### 5.0 Accounts & prerequisites
- [ ] Apple Developer Program ($99/yr) — Team Agent role, D-U-N-S number
- [ ] Google Play Console ($25 one-time) — developer account
- [ ] Apple: create App ID with **Push Notifications** + **Associated Domains** capabilities; generate APNs Auth Key (`.p8`)
- [ ] Google: Firebase project → add Android app (package `com.workersarena.app`) → `google-services.json` into `mobile/android`
- [ ] Domains: verify `workersarena.com` (Apple + Google); publish `apple-app-site-association` and `assetlinks.json`
- [ ] Legal: Privacy Policy (data collected, retention, deletion) + Terms — linked from the stores AND the app settings
- [ ] App icon 1024², splash, store screenshots (EN + AR), feature graphic, short + long descriptions (EN/AR)

### 5.1 Build & QA gates
- [ ] `npm run db:smoke` green (real-mode reads against Postgres)
- [ ] Full test suite (162 tests) + E2E hydration matrix green
- [ ] Offline shell: airplane-mode smoke on both platforms (search + top profiles cached)
- [ ] Push: FCM + APNs test sends land; deep links from notification taps open the right screen
- [ ] Biometric unlock, theme (light/dark), RTL rendering verified on device
- [ ] Payment: Stripe test-mode checkout on device (Apple Pay / Google Pay buttons)
- [ ] Perf: Lighthouse ≥ 90 (PWA/performance); cold start < 3 s on a mid-range Android

### 5.2 Submission
- [ ] iOS: TestFlight → internal → external (beta) → **App Review**: completeness (privacy nutrition labels, App Tracking Transparency if analytics), 2FA, no web-only placeholder content
- [ ] Android: internal testing → closed testing → **production**; declare data-safety form (contacts? location? none)
- [ ] KSA/Gulf note: check regional store compliance (PDPL data residency, payment descriptors) before launch

### 5.3 Post-launch
- [ ] Sentry mobile SDK (crash + ANR reporting) with release tracking
- [ ] Release cadence: weekly store builds; automated via EAS or GitHub Actions (§6)
- [ ] Rollout metrics: installs, store conversion (link → install), push opt-in rate, crash-free sessions

---

## 6. Build & release pipeline (sketch)

```yaml
# .github/workflows/mobile.yml (M2+)
# on tag mobile-* or manual dispatch
jobs:
  build:
    runs-on: macos-14            # Xcode + Android SDK
    steps:
      - npm ci && npm run db:generate
      - next build && next export        # static shell
      - npx cap sync                     # sync web → native projects
      - # iOS: xcodebuild -workspace mobile/ios/App.xcworkspace -scheme App \
        #        -configuration Release archive + export for App Store
      - # Android: cd mobile/android && ./gradlew bundleRelease
      - # Upload: fastlane deliver / supply (credentials from secrets)
```

- **Signing:** iOS certificates + provisioning profiles via Fastlane match (encrypted in repo secrets); Android upload key + Play App Signing.
- **Staging:** a `NEXT_PUBLIC_APP_URL` pointing at the preview environment for the store build; a separate `mobile/staging` scheme/ flavor pointing at prod for release builds.
- **Versioning:** sync native `versionCode`/`CFBundleVersion` to the app version on each release tag.

---

## 7. Milestone mapping

| Doc section | Milestone (PRODUCT.md) | Exit criteria |
|---|---|---|
| §2, §5.0 | M2 — Capacitor shell | Both native projects build; web app renders in WebView; offline shell boots |
| §3 | M2 — native push | FCM + APNs channels dispatch through the seam; tokens register; admin lists devices; pruning works |
| §4 | M1/M2 — deep links | Notification taps + universal/app links open the right routes |
| §5.1–5.2 | M3 — store launch | TestFlight + Play internal testing → production approval |
| §5.3, §6 | M3+ — ops | Crash reporting, weekly releases, rollout metrics |
| (PRODUCT.md §5.2) | M4 — Expo/RN | Only after PMF; shared API layer + native SDKs for payments/maps/chat |
