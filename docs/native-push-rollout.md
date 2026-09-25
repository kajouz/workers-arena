# Native Push Rollout — FCM + APNs (M2.5)

> **Companion to** [mobile-architecture.md §3](mobile-architecture.md) (which this doc supersedes where they overlap — §3 was the sketch, this is the buildable design). Status: **DESIGN, NOT IMPLEMENTED** — nothing in this document exists in code yet. Every code reference below was verified against the tree on 2026-09-25.

---

## 0. Executive summary

Native push takes one dependency the web path never needed: **device identity**. A web subscription self-identifies (the `endpoint` URL *is* the address); an FCM/APNs token is an opaque string that means nothing without a table row binding token → platform → owner. So the rollout is three workstreams that can land independently:

1. **Credentials** (calendar-bound, start immediately — Apple/Google approvals gate everything).
2. **Token registration** (schema + store + API + client — pure in-repo work, testable with console providers).
3. **Delivery channels** (FCM HTTP v1 + APNs HTTP/2 providers behind the existing seam — no SDKs needed).

Each phase is demo-mode testable; production credentials plug in without further code changes.

---

## 1. Credential checklist

### 1.1 Firebase / FCM (Android) — free, ~1 day

| # | Step | Notes |
|---|------|-------|
| F1 | Create Firebase project `workersarena` (or reuse existing) | One project serves dev + prod via separate Android `applicationId` suffixes if desired (`com.workersarena.app` + `.dev`) |
| F2 | Add Android app, package name **must equal** `capacitor.config.ts` `appId` → `com.workersarena.app` | A mismatch means FCM silently never matches the app |
| F3 | Download `google-services.json` → `android/app/google-services.json` | Gitignored (contains project keys — public-ish but keep out of the repo); CI injects via secret for build jobs |
| F4 | Service account: Firebase console → Project settings → Service accounts → **Generate new private key** | Single JSON; this is `FCM_SERVICE_ACCOUNT` |
| F5 | Store JSON as repo secret `FCM_SERVICE_ACCOUNT` (inline JSON, not a path — Vercel has no disk) | The provider reads env, never `fs` |

### 1.2 Apple / APNs (iOS) — paid, 1–2 weeks calendar

| # | Step | Notes |
|---|------|-------|
| A1 | Apple Developer Program membership ($99/yr) | Hard prerequisite for anything iOS |
| A2 | App ID `com.workersarena.app` with **Push Notifications capability** enabled | Xcode → Signing & Capabilities; mirrors into `ios/App/App.entitlements` |
| A3 | Create APNs **Key** (.p8) — Apple Developer → Certificates, IDs & Profiles → Keys | One key serves sandbox + production; max 2 per account |
| A4 | Record `KEY_ID` (10 chars) and `TEAM_ID` (from membership page) | `APNS_KEY_ID`, `APNS_TEAM_ID` |
| A5 | Store the .p8 as repo secret `APNS_KEY` (PEM text, not a path) | Same inline-JSON logic as FCM |
| A6 | Provisioning profile for build signing | mobile.yml already builds unsigned; signing joins via fastlane match (§6 of mobile-architecture.md) |

### 1.3 Environment matrix

```
NOTIFY_PUSH_PROVIDER   unset (console)  →  dev default, zero credentials
FCM_PROJECT_ID         workersarena
FCM_SERVICE_ACCOUNT    {inline service-account JSON}
APNS_KEY               {inline .p8 PEM}
APNS_KEY_ID            ABC123DEFG
APNS_TEAM_ID           TEAMID1234
APNS_TOPIC             com.workersarena.app   (= appId; default derivable from capacitor.config.ts)
APNS_HOST              api.sandbox.push.apple.com  ← dev builds | api.push.apple.com ← TestFlight/App Store
```

All optional individually: the channel factory adds a native channel only when its credentials are present (§3.2 of mobile-architecture.md's multi-channel posture — a configured-FCM-only fleet sends Android and silently skips iOS, with a startup warn).

---

## 2. Token registration flow

### 2.1 Storage: new `PushDevice` model — *not* an overload of `PushSubscription`

The doc sketch proposed adding `platform`/`token` to `PushSubscription`. Deliberately changed: Prisma cannot express conditional uniqueness (web rows unique on `endpoint`, native rows unique on `token` would need a second partial index outside the schema), and every web-push send loop would gain a platform guard. One row per device kind keeps both paths dumb:

```prisma
/// Native (Capacitor) push device tokens — FCM (android) / APNs (ios).
/// Separate from PushSubscription (web): different address kind, different
/// uniqueness, different pruning semantics (see native-push-rollout.md §2).
model PushDevice {
  id        String   @id @default(cuid())
  platform  String   // "android" | "ios" (client-declared, validated)
  token     String   @unique
  ownerId   String?  // same dual-stamp contract as PushSubscription
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  device    String?  // friendly label from the native platform info
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
  @@index([userId])
  @@index([platform])
}
```

Migration: `prisma/migrations/<ts>_push_devices/migration.sql` (hand-written, matching the GuestOtpChallenge precedent — the dev DB drift makes `migrate dev` require a reset).

### 2.2 Store: extend the dual-adapter registry

`src/lib/notifications/push-store.ts` gains a native half mirroring the existing file/prisma split exactly (same `storeAdapterMode()`, same ownership contract, same `pushOwnerStamp` reuse):

```ts
export interface PushDeviceJson {
  platform: "android" | "ios";
  token: string;
  ownerId?: string;   // demo cookie-session id (u-…)
  userId?: string;    // production FK
  device?: string;
}
// registerPushDevice / unregisterPushDevice(token, actingId?) / getDevicesByPlatform(platform) /
// listPushDevices() / forceRemovePushDevice(token)  — all mirroring the *PushSubscription* functions
```

File adapter: `.data/push-devices.json`, same atomic-write + mutation-chain pattern. No new config; the adapter choice is already centralized.

### 2.3 API: one route, two body shapes

`POST /api/push/register` (the route web-push already uses — the doc sketch's "extend" is right):

```ts
// web (unchanged — byte-compatible)
{ subscription: { endpoint, keys: { p256dh, auth } } }
// native (new)
{ platform: "android" | "ios", token: string, device?: string }
{ unregister: string, platform: "web" | "android" | "ios" }  // platform disambiguates unregister
```

Validation: `platform` enum-checked; `token` 32–4096 chars (FCM ~152–163, APNs 64 hex — the loose bound survives both providers' evolution); owner stamping identical to web. Unauthenticated → 401 exactly as today (native WebView carries the same session cookie).

### 2.4 Client: what the app does (most of it exists)

`src/lib/mobile/capacitor-init.ts` already requests permission, registers, and POSTs the token on `registration` — it currently POSTs to `/api/push/register` with `{ token, platform }`, which this design *makes valid*. Changes needed:

1. Include `device` label from `@capacitor/device` (`deviceName`/`model`) — today the body omits it.
2. The `pushNotificationReceived`/`pushNotificationActionPerformed` handlers already route taps through `handleDeepLink` (shipped this session) — no change.
3. Re-register on app foreground after a token refresh (FCM tokens rotate): listen to `pushNotificationRegistered`... actually Capacitor re-fires `registration` — the existing listener covers it; **add an `appStateChange` isActive re-check** that POSTs only if `localStorage.wa-push-token !== token.value` to keep the request count at zero on normal foregrounds.

### 2.5 Test surface

Unit tests mirror `tests/notifications.test.ts`: file-store round-trip for both platforms, ownership checks on unregister, adapter-mode selection, route-body validation (web body still accepted, native body accepted, garbage 400). All runnable in demo mode with zero credentials.

---

## 3. Delivery channels (no SDKs)

### 3.1 FCM (Android) — `src/lib/notifications/providers/fcm.ts`

HTTP v1, exactly per §3.4 of the doc, with three refinements the sketch glossed:

- **Token minting**: RS256 JWT (service-account `client_email` + `private_key`) → `https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/firebase.messaging`. Cache the access token **in module scope until 5 min before `expires_in`** — process reuse, not per-send.
- **Locale**: `notification.title/body` chosen by `payload.recipient?.locale` (the store rows don't carry locale; the recipient stamp on the ChannelPayload does — matches web-push `renderPushPayload`).
- **Batching**: `Promise.allSettled` per send (the sketch's shape), but **chunk to 200 tokens per event loop turn** — a broadcast to thousands of devices must not hold thousands of in-flight fetches.

Prune contract: FCM returns 404 with `UNREGISTERED` in the error body → `forceRemovePushDevice(token)`.

### 3.2 APNs (iOS) — `src/lib/notifications/providers/apns.ts`

HTTP/2 per §3.5, refinements:

- **JWT**: ES256 over `{iss: TEAM_ID, iat: now}` with the .p8 as the key, `kid: KEY_ID` header. Cache for ~50 minutes (Apple accepts up to 1h).
- **Node http2 session reuse**: one `http2.connect(APNS_HOST)` session kept alive in module scope; a new session per send would multiply TLS handshakes and trip APNs' connection hygiene. On `goaway`/error → tear down and let the next send reconnect.
- **Payload**: `aps.alert` from recipient locale; `url` at the top level (the deep-link contract capacitor-init already consumes).
- **Prune contract**: HTTP 410 → `forceRemovePushDevice(token)`; 403/400 → report, don't prune (a bad key shouldn't silently empty the device table).

### 3.3 Channel factory

`createPushChannel()` becomes `getPushChannels(): NotificationChannel[]`:

```ts
export function getPushChannels(): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (webPushConfigured()) channels.push(new WebPushChannel());
  if (fcmConfigured())     channels.push(new FcmChannel());
  if (apnsConfigured())    channels.push(new ApnsChannel());
  if (channels.length === 0) channels.push(new ConsolePushChannel());
  return channels;
}
```

`dispatcher.ts` gains no loop change — `dispatch()` already fans to N channels. The demo-mode console channel keeps dev observable.

---

## 4. Admin surface: the device table

### 4.1 Page

Extend `/admin/push-subscriptions` into a two-tab surface (web subscriptions | native devices), same layout shell:

```
Native devices (tab 2)
┌──────────┬────────────────────────┬──────────┬────────────┬─────────────┬───────────────┐
│ Platform │ Token (truncated 12+…) │ Owner    │ Device     │ Registered  │ Last active   │
├──────────┼────────────────────────┼──────────┼────────────┼─────────────┼───────────────┤
│ android  │ fSx8…Kd2               │ u-worker │ Pixel 8    │ 2026-09-20  │ 2 min ago     │
│ ios      │ a1b2…9f                │ u-admin  │ iPhone 15  │ 2026-09-22  │ 3 hours ago   │
└──────────┴────────────────────────┴──────────┴────────────┴─────────────┴───────────────┘
  [Prune dead]  (per-row: [Test send] [Remove])                        Total: 2 devices · 1 android · 1 ios
```

Concretely:
- **`listPushDevices()`** feeds the table — same `PushSubscriptionRecord`-shaped rows (owner + device + timestamps + truncated token, never the full token: it is an unguessable send address, treat like a credential in any UI).
- **`POST /api/admin/push-subscriptions` gains `action: "prune-devices"`** (probe every native token with a silent TTL:0 push — FCM dry-run send / APNs `apns-push-type: alert` with `aps: {sound: {critical: 0}}`; remove 404/410) and **`action: "test-send"` extends with `platform`+`token`** to target a native row (delivery confirmed on-device, `ACTION_CODES.PUSH_TEST_SEND_*` logged as today).
- **`ACTION_CODES.PUSH_DEVICE_REMOVED`** joins the existing PUSH_SUBSCRIPTION_* trio for force-remove logging.

### 4.2 What the admin sees day-to-day

- Registration health: token count per platform vs installs (a growing gap = registration broken on a platform).
- Staleness: `lastActiveAt` older than ~90 days is FCM/APNs' own garbage-collection territory — the prune action resolves it.
- Delivery debugging: test-send to one row before blaming the channel config.

---

## 5. Rollout order (each phase shippable alone)

| Phase | Work | Gate | Depends on |
|-------|------|------|-----------|
| **P1** | Schema + store native half + register API + client device label | Unit tests (demo store) | nothing — start now |
| **P2** | FCM + APNs providers, channel factory, `.env.example` entries | Unit tests with a mocked fetch layer; real send needs credentials | P1 (store queries), credentials (§1) |
| **P3** | Admin device tab + prune/test-send actions | Component tests + demo-mode screenshot sweep | P1 |
| **P4** | push-prune cron extension (probe native tokens on schedule) | Nightly live-Postgres job turns green | P2 + a real device registered |

Sequencing note: P1 + P3 unblock with **zero credentials** because the console provider and file store make the whole surface work in demo mode. Credentials only gate P2's real-send verification — which is exactly why the checklist in §1 should be kicked off in parallel, not first.

---

## 6. Explicit non-goals (v1)

- **No notification preferences per device** — the seam's existing per-user channel gates (`NOTIFY_*_ENABLED`) are the only off-switch; per-device mute is a later product decision.
- **No badge-count sync** — the doc's §3.6 mention is deferred; it needs an unread-count RPC on foreground, which is its own feature.
- **No topic/segment sends** — v1 sends to owner-scoped token lists only; topics would bypass the per-user security stamp.
- **No silent/data-only messaging** — every send is an alert; silent background syncs abuse battery and Apple review flags them.
