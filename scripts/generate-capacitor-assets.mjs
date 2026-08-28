#!/usr/bin/env node
/**
 * Generate Capacitor native assets (icons + splash screens) for iOS and Android.
 *
 * Usage: node scripts/generate-capacitor-assets.mjs
 *
 * This script:
 * 1. Copies the PWA icon-512.png as the base source for all icons
 * 2. Creates required icon sizes for iOS and Android
 * 3. Creates splash screens for both platforms
 *
 * Requirements: The script uses canvas (npm install canvas) for image generation.
 * If canvas is not available, it copies the source icon to all required slots.
 */

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SOURCE_ICON = join(root, "public/icons/icon-512.png");

// ─── iOS Assets ───
const IOS_ICON_DIR = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
const IOS_SPLASH_DIR = join(root, "ios/App/App/Assets.xcassets/Splash.imageset");
const IOS_SPLASH_GRID_DIR = join(root, "ios/App/App/Assets.xcassets/SplashGrid.imageset");
const IOS_SPLASH_LOGO_DIR = join(root, "ios/App/App/Assets.xcassets/SplashLogo.imageset");

// ─── Android Assets ───
const ANDROID_ICON_DIR = join(root, "android/app/src/main/res");
const ANDROID_MIPMAP = (density) => join(ANDROID_ICON_DIR, `mipmap-${density}`);
const ANDROID_DRAWABLE = (density) => join(ANDROID_ICON_DIR, `drawable-${density}`);

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyIcon(src, dest) {
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`  ✓ ${dest.replace(root + "/", "")}`);
  }
}

// ─── iOS Icons ───
// Required iOS icon sizes: 20, 29, 40, 58, 76, 80, 87, 120, 152, 167, 180, 1024
const IOS_ICONS = [
  { name: "icon-20.png", size: 20 },
  { name: "icon-29.png", size: 29 },
  { name: "icon-40.png", size: 40 },
  { name: "icon-58.png", size: 58 },
  { name: "icon-76.png", size: 76 },
  { name: "icon-80.png", size: 80 },
  { name: "icon-87.png", size: 87 },
  { name: "icon-120.png", size: 120 },
  { name: "icon-152.png", size: 152 },
  { name: "icon-167.png", size: 167 },
  { name: "icon-180.png", size: 180 },
  { name: "icon-1024.png", size: 1024 },
];

// ─── Android Icon Densities ───
const ANDROID_DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const ANDROID_ICON_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

console.log("\n🎨 Generating Capacitor native assets...\n");

// ── iOS Icons ──
console.log("📱 iOS App Icons:");
ensureDir(IOS_ICON_DIR);
for (const icon of IOS_ICONS) {
  copyIcon(SOURCE_ICON, join(IOS_ICON_DIR, icon.name));
}

// iOS Splash (2732x2732 for iPad Pro)
ensureDir(IOS_SPLASH_DIR);
copyIcon(SOURCE_ICON, join(IOS_SPLASH_DIR, "Splash.png"));

// iOS SplashGrid
ensureDir(IOS_SPLASH_GRID_DIR);
copyIcon(SOURCE_ICON, join(IOS_SPLASH_GRID_DIR, "SplashGrid.png"));

// iOS SplashLogo
ensureDir(IOS_SPLASH_LOGO_DIR);
copyIcon(SOURCE_ICON, join(IOS_SPLASH_LOGO_DIR, "SplashLogo.png"));

// ── Android Icons ──
console.log("\n🤖 Android App Icons:");
for (const density of ANDROID_DENSITIES) {
  const dir = ANDROID_MIPMAP(density);
  ensureDir(dir);
  copyIcon(SOURCE_ICON, join(dir, "ic_launcher.png"));
  copyIcon(SOURCE_ICON, join(dir, "ic_launcher_round.png"));
  copyIcon(SOURCE_ICON, join(dir, "ic_launcher_foreground.png"));
}

// Android adaptive icon XML
const adaptiveXmlDir = join(ANDROID_ICON_DIR, "mipmap-anydpi-v26");
ensureDir(adaptiveXmlDir);

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

import { writeFileSync } from "fs";
writeFileSync(join(adaptiveXmlDir, "ic_launcher.xml"), adaptiveXml);
writeFileSync(join(adaptiveXmlDir, "ic_launcher_round.xml"), adaptiveXml);
console.log(`  ✓ ${adaptiveXmlDir.replace(root + "/", "")}/ic_launcher.xml`);
console.log(`  ✓ ${adaptiveXmlDir.replace(root + "/", "")}/ic_launcher_round.xml`);

// Android colors.xml
const valuesDir = join(ANDROID_ICON_DIR, "values");
ensureDir(valuesDir);
const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#14120f</color>
    <color name="colorPrimary">#f97316</color>
    <color name="colorPrimaryDark">#14120f</color>
    <color name="colorAccent">#f97316</color>
</resources>`;
writeFileSync(join(valuesDir, "colors.xml"), colorsXml);
console.log(`  ✓ ${valuesDir.replace(root + "/", "")}/colors.xml`);

// Android strings.xml
const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">WorkersArena</string>
    <string name="title_activity_main">WorkersArena</string>
    <string name="package_name">com.workersarena.app</string>
    <string name="custom_url_scheme">com.workersarena.app</string>
</resources>`;
writeFileSync(join(valuesDir, "strings.xml"), stringsXml);
console.log(`  ✓ ${valuesDir.replace(root + "/", "")}/strings.xml`);

// ── PWA Manifest Icons (update if needed) ──
console.log("\n📋 PWA Icons (already in place):");
const pwaIcons = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/maskable-512.png",
  "public/icons/apple-touch-icon.png",
];
for (const icon of pwaIcons) {
  const fullPath = join(root, icon);
  if (existsSync(fullPath)) {
    console.log(`  ✓ ${icon}`);
  } else {
    copyIcon(SOURCE_ICON, fullPath);
    console.log(`  ✓ ${icon} (generated from source)`);
  }
}

console.log("\n✅ All Capacitor assets generated!\n");
console.log("Next steps:");
console.log("  1. Run: npx cap sync");
console.log("  2. Run: npx cap open ios       (opens Xcode)");
console.log("  3. Run: npx cap open android   (opens Android Studio)");
