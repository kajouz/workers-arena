import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

/** Read a repo file relative to the project root. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

describe("Mobile wrapper wiring (UI consumers)", () => {
  // Four wrappers shipped with no consumer outside themselves. These
  // structural guards pin the wiring points so a refactor cannot silently
  // detach them again — the exact "installed but never called" state this
  // wiring pass closed.

  it("initCapacitor arms the haptics flag at boot", () => {
    // Without this, every haptic*() call in booking/chat UIs no-ops forever,
    // because the helpers stay inert until initHaptics() runs once natively.
    const init = read("src/lib/mobile/capacitor-init.ts");
    expect(init).toContain("initHaptics");
  });

  it("push notification taps route through the deep-link matcher", () => {
    const init = read("src/lib/mobile/capacitor-init.ts");
    expect(init).toMatch(/pushNotificationActionPerformed[\s\S]{0,900}handleDeepLink/);
    // The verbatim-assignment hole stays closed: notification payload URLs
    // must be validated by handleDeepLink, never assigned as-is.
    expect(init).not.toMatch(/window\.location\.href\s*=\s*url\b/);
  });

  it("appUrlOpen routes through the deep-link matcher (was log-only)", () => {
    const init = read("src/lib/mobile/capacitor-init.ts");
    expect(init).toMatch(/appUrlOpen[\s\S]{0,600}handleDeepLink/);
  });

  it("booking lifecycle actions fire haptics on press and outcome", () => {
    const actions = read("src/components/dashboard/bookings/booking-actions.tsx");
    expect(actions).toContain("hapticMedium()");
    expect(actions).toContain("hapticSuccess()");
    expect(actions).toContain("hapticError()");
  });

  it("chat send fires haptics on press and outcome", () => {
    const chat = read("src/components/bookings/booking-chat.tsx");
    expect(chat).toContain("hapticLight()");
    expect(chat).toContain("hapticSuccess()");
    expect(chat).toContain("hapticError()");
  });

  it("the biometric flow hands the decrypted credential to its caller", () => {
    // biometricLogin used to retrieve the credential and discard it — no
    // caller could ever complete the flow. The return contract is the fix.
    const bio = read("src/lib/mobile/biometric-auth.ts");
    expect(bio).toContain("credentials,");
  });

  it("the login page wires biometric unlock and the opt-in capture", () => {
    const login = read("src/app/[locale]/(public)/auth/login/page.tsx");
    expect(login).toContain("<BiometricLogin");
    expect(login).toContain("enableBiometricLogin");
    expect(login).toContain("unlockAndSignIn");
  });

  it("biometric strings exist in both dictionaries", async () => {
    const { en } = await import("@/lib/i18n/translations/en");
    const { ar } = await import("@/lib/i18n/translations/ar");
    const enAuth = (en as unknown as { auth: Record<string, string> }).auth;
    const arAuth = (ar as unknown as { auth: Record<string, string> }).auth;
    for (const key of ["biometricUnlock", "biometricBusy", "biometricFailed", "biometricEnable"]) {
      expect(enAuth[key], `en.auth.${key} missing`).toBeTruthy();
      expect(arAuth[key], `ar.auth.${key} missing`).toBeTruthy();
    }
  });
});

describe("Capacitor Mobile Configuration", () => {
  it("has capacitor.config.ts", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    expect(existsSync(configPath)).toBe(true);
  });

  it("has correct app ID", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain("com.workersarena.app");
  });

  it("has correct app name", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain("WorkersArena");
  });

  it("has push notifications configured", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain("PushNotifications");
    expect(config).toContain("presentationOptions");
  });

  it("has status bar configured", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain("StatusBar");
  });

  it("has splash screen configured", () => {
    const configPath = join(process.cwd(), "capacitor.config.ts");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain("SplashScreen");
  });

  it("has Capacitor dependencies in package.json", () => {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    
    expect(pkg.dependencies).toHaveProperty("@capacitor/core");
    expect(pkg.dependencies).toHaveProperty("@capacitor/app");
    expect(pkg.dependencies).toHaveProperty("@capacitor/push-notifications");
    expect(pkg.dependencies).toHaveProperty("@capacitor/status-bar");
    expect(pkg.dependencies).toHaveProperty("@capacitor/splash-screen");
    expect(pkg.dependencies).toHaveProperty("@capacitor/haptics");
    expect(pkg.dependencies).toHaveProperty("@capacitor/keyboard");
  });

  it("has Capacitor scripts in package.json", () => {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    
    expect(pkg.scripts).toHaveProperty("cap:init");
    expect(pkg.scripts).toHaveProperty("cap:add");
    expect(pkg.scripts).toHaveProperty("cap:sync");
    expect(pkg.scripts).toHaveProperty("cap:open:ios");
    expect(pkg.scripts).toHaveProperty("cap:open:android");
    expect(pkg.scripts).toHaveProperty("cap:build");
  });

  it("has mobile README", () => {
    const readmePath = join(process.cwd(), "mobile", "README.md");
    expect(existsSync(readmePath)).toBe(true);
  });

  it("has push notification handler", () => {
    const handlerPath = join(process.cwd(), "src", "lib", "mobile", "push-notifications.ts");
    expect(existsSync(handlerPath)).toBe(true);
  });

  it("has deep linking handler", () => {
    const handlerPath = join(process.cwd(), "src", "lib", "mobile", "deep-links.ts");
    expect(existsSync(handlerPath)).toBe(true);
  });
});

describe("Native shells and mobile CI (docs/mobile-architecture.md §6)", () => {
  it("commits BOTH native shells (not gitignored)", () => {
    for (const shell of ["ios", "android"]) {
      expect(existsSync(join(process.cwd(), shell))).toBe(true);
      // The shell must be tracked: the mobile workflow checks out what git
      // has. (They were gitignored for a year — the shells existed only on
      // one machine and CI had nothing to build.)
      const gitignore = read(".gitignore");
      expect(gitignore).not.toMatch(new RegExp(`^/${shell}/$`, "m"));
    }
  });

  it("keeps derived native artifacts out of git", () => {
    // Regenerable outputs must stay ignored even though the shells are
    // committed — `cap sync` and the native builds recreate them.
    for (const derived of [
      "ios/App/App/public",
      "ios/App/Pods",
      "ios/DerivedData",
      "android/app/src/main/assets/public",
      "android/app/build",
      "android/local.properties",
    ]) {
      const res = spawnSync("git", ["check-ignore", derived], { cwd: process.cwd() });
      expect(res.status, `${derived} should be gitignored`).toBe(0);
    }
  });

  it("has a mobile workflow that builds both shells", () => {
    const wf = read(".github/workflows/mobile.yml");
    expect(wf).toContain("xcodebuild");
    expect(wf).toContain("generic/platform=iOS");
    expect(wf).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(wf).toContain("bundleRelease");
    // The AAB/App.app assertions are the gate's teeth — a green build that
    // produced no artifact must fail, not pass vacuously.
    expect(wf).toContain("app-release.aab");
    expect(wf).toContain("Release-iphoneos/App.app");
  });

  it("does not pretend to static-export the app for the shells", () => {
    // The shells load the deployed origin (server.url); a static export is
    // impossible for this app (API routes + proxy middleware). If someone
    // reintroduces a `next build` STEP into mobile CI, this guard makes them
    // confront that decision in a reviewed change. Comment lines are ignored —
    // the header comment explains exactly why no such step exists.
    const wfCode = read(".github/workflows/mobile.yml")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(wfCode).not.toContain("next build");
    const config = read("next.config.ts");
    expect(config).not.toContain("CAP_EXPORT");
  });

  it("android launcher background color is defined exactly once", () => {
    // A pre-existing duplicate resource (template white in
    // ic_launcher_background.xml vs the real #14120f in colors.xml) made the
    // committed shell unbuildable — discovered the first time anyone ran
    // bundleRelease. Pin the single definition.
    const colors = read("android/app/src/main/res/values/colors.xml");
    expect(colors).toContain("ic_launcher_background");
    expect(existsSync(join(process.cwd(), "android/app/src/main/res/values/ic_launcher_background.xml"))).toBe(false);
  });
});

describe("Mobile Build Script", () => {
  it("has build script", () => {
    const scriptPath = join(process.cwd(), "scripts", "cap-build.sh");
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("build script is executable", () => {
    const scriptPath = join(process.cwd(), "scripts", "cap-build.sh");
    const script = readFileSync(scriptPath, "utf-8");
    expect(script).toContain("#!/bin/bash");
    expect(script).toContain("cap sync");
    expect(script).toContain("cap open");
  });
});
