import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

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
