#!/usr/bin/env node

/**
 * WorkersArena — App Store Assets Generator
 * 
 * Generates:
 * - iOS App Store metadata (description, keywords, screenshots)
 * - Google Play Store metadata (description, screenshots)
 * - App icons in required sizes
 * - Screenshot guidelines
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const APP_NAME = "WorkersArena";
const APP_ID = "com.workersarena.app";
const VERSION = "1.0.0";

// ─── iOS App Store Metadata ─────────────────────────────────────────

const iosMetadata = {
  name: APP_NAME,
  subtitle: "Professional Workers Directory",
  bundleId: APP_ID,
  version: VERSION,
  copyright: `© ${new Date().getFullYear()} WorkersArena`,
  
  // Primary Category
  primaryCategory: "Business",
  primaryFirstLevelCategory: "Business",
  primarySecondLevelCategory: "Services",
  
  // Secondary Category
  secondaryCategory: "Lifestyle",
  secondaryFirstLevelCategory: "Lifestyle",
  secondarySecondLevelCategory: "Home Improvement",
  
  // Description (4000 char max)
  description: `WorkersArena is the trusted marketplace directory for professional workers across the MENA region. Find, compare, and hire verified professionals for all your home and business needs.

🏠 WHAT YOU CAN FIND
• Plumbers, electricians, AC technicians
• Carpenters, painters, masons
• Cleaning services, movers, gardeners
• 20+ trade categories with verified professionals

✨ KEY FEATURES
• 🔍 Smart Search — Find workers by category, location, rating, and availability
• ⭐ Verified Reviews — Real reviews from verified customers
• 📅 Easy Booking — Schedule appointments directly through the app
• 💬 In-App Chat — Communicate with workers without sharing personal numbers
• 🔒 Privacy Protection — Masked phone numbers for secure communication
• 🚨 Emergency Services — 24/7 emergency workers available
• 💳 Secure Payments — Multiple payment options including OMT and Whish
• 🌐 Bilingual — Full Arabic (RTL) + English support

👷 FOR WORKERS
• Grow your business with a professional profile
• Manage bookings and availability
• Get paid securely through the platform
• Build your reputation with verified reviews
• Access premium tools and analytics

🏢 FOR COMPANIES
• Advertise your services to qualified customers
• Manage campaigns and track performance
• Access detailed analytics and reporting

🔒 TRUST & SAFETY
• All workers are verified
• Secure payment processing
• Privacy-protected communication
• Dispute resolution support
• Warranty coverage

📱 MOBILE APP
• Native iOS experience
• Push notifications for bookings
• Offline access to saved workers
• Quick booking from anywhere

Download WorkersArena today and find the right professional for every job!`,

  // Keywords (100 chars max, comma-separated)
  keywords: "workers,plumber,electrician,AC,technician,handyman,home services,repair,maintenance,booking,marketplace,directory,MENA,Arabic,professional,verified,reviews,emergency,24/7,payment",
  
  // What's New (4000 char max)
  releaseNotes: `Version ${VERSION}

🎉 Initial Release

• Find and hire verified professional workers
• Smart search with filters and autocomplete
• Easy booking and scheduling
• In-app chat with privacy protection
• Secure payments via OMT and Whish
• Emergency 24/7 services
• Bilingual Arabic + English support
• Push notifications
• Worker profiles with reviews
• Company advertising platform

We're excited to bring WorkersArena to the App Store! Your feedback helps us improve.`,

  // Privacy Policy URL
  privacyPolicyUrl: "https://workersarena.com/privacy",
  
  // Support URL
  supportUrl: "https://workersarena.com/support",
  
  // Marketing URL
  marketingUrl: "https://workersarena.com",
  
  // App Rating
  appRating: {
    cartoonFantasyViolence: false,
    realisticViolence: false,
    prolongedGraphicSadisticRealisticViolence: false,
    profanityCrudeHumorMatureHumor: false,
    sexualContentNudity: false,
    graphicSexualContentNudity: false,
    alcoholTobaccoDrugUse: false,
    gambling: false,
    contests: false,
    unrestrictedWebAccess: false,
    gamblingAndContests: false,
  },
};

// ─── Google Play Store Metadata ─────────────────────────────────────

const androidMetadata = {
  title: APP_NAME,
  shortDescription: "Find and hire verified professional workers for all your home and business needs.",
  
  fullDescription: `WorkersArena is the trusted marketplace directory for professional workers across the MENA region. Find, compare, and hire verified professionals for all your home and business needs.

🏠 WHAT YOU CAN FIND
• Plumbers, electricians, AC technicians
• Carpenters, painters, masons
• Cleaning services, movers, gardeners
• 20+ trade categories with verified professionals

✨ KEY FEATURES
• 🔍 Smart Search — Find workers by category, location, rating, and availability
• ⭐ Verified Reviews — Real reviews from verified customers
• 📅 Easy Booking — Schedule appointments directly through the app
• 💬 In-App Chat — Communicate with workers without sharing personal numbers
• 🔒 Privacy Protection — Masked phone numbers for secure communication
• 🚨 Emergency Services — 24/7 emergency workers available
• 💳 Secure Payments — Multiple payment options including OMT and Whish
• 🌐 Bilingual — Full Arabic (RTL) + English support

👷 FOR WORKERS
• Grow your business with a professional profile
• Manage bookings and availability
• Get paid securely through the platform
• Build your reputation with verified reviews
• Access premium tools and analytics

🏢 FOR COMPANIES
• Advertise your services to qualified customers
• Manage campaigns and track performance
• Access detailed analytics and reporting

🔒 TRUST & SAFETY
• All workers are verified
• Secure payment processing
• Privacy-protected communication
• Dispute resolution support
• Warranty coverage

📱 MOBILE APP
• Native Android experience
• Push notifications for bookings
• Offline access to saved workers
• Quick booking from anywhere

Download WorkersArena today and find the right professional for every job!`,

  // Short description (80 chars max)
  shortDescriptionMax80: "Find & hire verified workers — plumbers, electricians, AC techs & more",
  
  // Category
  category: "BUSINESS",
  
  // Content Rating
  contentRating: "Everyone",
  
  // Privacy Policy
  privacyPolicyUrl: "https://workersarena.com/privacy",
  
  // Features
  features: [
    "Push Notifications",
    "In-App Chat",
    "Booking System",
    "Payment Integration",
    "Worker Profiles",
    "Reviews & Ratings",
    "Emergency Services",
    "Bilingual Support",
  ],
  
  // Screenshots
  screenshots: {
    phone: [
      "homepage-hero.png",
      "search-results.png",
      "worker-profile.png",
      "booking-flow.png",
      "chat-screen.png",
      "payments.png",
    ],
    tablet: [
      "homepage-tablet.png",
      "search-tablet.png",
      "dashboard-tablet.png",
    ],
  },
};

// ─── App Icon Sizes ─────────────────────────────────────────────────

const iconSizes = {
  ios: {
    "App Icon": [
      { size: "20x20", scale: "2x", filename: "icon-20@2x.png" },
      { size: "20x20", scale: "3x", filename: "icon-20@3x.png" },
      { size: "29x29", scale: "2x", filename: "icon-29@2x.png" },
      { size: "29x29", scale: "3x", filename: "icon-29@3x.png" },
      { size: "40x40", scale: "2x", filename: "icon-40@2x.png" },
      { size: "40x40", scale: "3x", filename: "icon-40@3x.png" },
      { size: "60x60", scale: "2x", filename: "icon-60@2x.png" },
      { size: "60x60", scale: "3x", filename: "icon-60@3x.png" },
      { size: "1024x1024", scale: "1x", filename: "icon-1024.png" },
    ],
    "App Store": [
      { size: "1024x1024", scale: "1x", filename: "app-store-icon.png" },
    ],
    "Marketing": [
      { size: "1024x512", scale: "1x", filename: "marketing-icon.png" },
    ],
  },
  android: {
    "Launcher Icon": [
      { density: "mdpi", size: "48x48", filename: "icon-48.png" },
      { density: "hdpi", size: "72x72", filename: "icon-72.png" },
      { density: "xhdpi", size: "96x96", filename: "icon-96.png" },
      { density: "xxhdpi", size: "144x144", filename: "icon-144.png" },
      { density: "xxxhdpi", size: "192x192", filename: "icon-192.png" },
    ],
    "Play Store": [
      { size: "512x512", filename: "play-store-icon.png" },
    ],
  },
};

// ─── Screenshot Guidelines ──────────────────────────────────────────

const screenshotGuidelines = {
  ios: {
    devices: [
      { name: "iPhone 6.7\"", width: 1290, height: 2796 },
      { name: "iPhone 6.5\"", width: 1242, height: 2688 },
      { name: "iPhone 5.5\"", width: 1242, height: 2208 },
      { name: "iPad Pro 12.9\"", width: 2048, height: 2732 },
    ],
    requirements: [
      "Minimum 3 screenshots required",
      "Maximum 10 screenshots per device",
      "JPEG or PNG format",
      "RGB color space",
      "No alpha channel",
      "72 DPI",
    ],
  },
  android: {
    devices: [
      { name: "Phone", width: 1080, height: 1920 },
      { name: "Tablet 7\"", width: 1200, height: 1920 },
      { name: "Tablet 10\"", width: 1800, height: 2560 },
    ],
    requirements: [
      "Minimum 2 screenshots required",
      "Maximum 8 screenshots",
      "JPEG or PNG format",
      "16:9 or 9:16 aspect ratio",
    ],
  },
};

// ─── Generate Files ─────────────────────────────────────────────────

const outputDir = join(process.cwd(), "app-store-assets");

function generateFiles() {
  console.log("📱 Generating App Store Assets...\n");

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // iOS metadata
  const iosDir = join(outputDir, "ios");
  if (!existsSync(iosDir)) {
    mkdirSync(iosDir, { recursive: true });
  }
  
  writeFileSync(
    join(iosDir, "metadata.json"),
    JSON.stringify(iosMetadata, null, 2)
  );
  
  writeFileSync(
    join(iosDir, "description.txt"),
    iosMetadata.description
  );
  
  writeFileSync(
    join(iosDir, "keywords.txt"),
    iosMetadata.keywords
  );
  
  writeFileSync(
    join(iosDir, "release-notes.txt"),
    iosMetadata.releaseNotes
  );

  // Android metadata
  const androidDir = join(outputDir, "android");
  if (!existsSync(androidDir)) {
    mkdirSync(androidDir, { recursive: true });
  }
  
  writeFileSync(
    join(androidDir, "metadata.json"),
    JSON.stringify(androidMetadata, null, 2)
  );
  
  writeFileSync(
    join(androidDir, "full-description.txt"),
    androidMetadata.fullDescription
  );
  
  writeFileSync(
    join(androidDir, "short-description.txt"),
    androidMetadata.shortDescriptionMax80
  );

  // Icon sizes
  writeFileSync(
    join(outputDir, "icon-sizes.json"),
    JSON.stringify(iconSizes, null, 2)
  );

  // Screenshot guidelines
  writeFileSync(
    join(outputDir, "screenshot-guidelines.json"),
    JSON.stringify(screenshotGuidelines, null, 2)
  );

  // README with instructions
  const readme = `# App Store Assets

This directory contains all metadata and guidelines for publishing WorkersArena on the App Store and Google Play Store.

## Directory Structure

\`\`\`
app-store-assets/
├── ios/
│   ├── metadata.json          # Full iOS metadata
│   ├── description.txt        # App description
│   ├── keywords.txt           # App Store keywords
│   └── release-notes.txt      # What's New text
├── android/
│   ├── metadata.json          # Full Android metadata
│   ├── full-description.txt   # Play Store description
│   └── short-description.txt  # Short description
├── icon-sizes.json            # Required icon sizes
├── screenshot-guidelines.json # Screenshot requirements
└── README.md                  # This file
\`\`\`

## iOS App Store

### Required Assets
1. **App Icon** — 1024x1024 PNG (no transparency, no rounded corners)
2. **Screenshots** — At least 3, maximum 10 per device
3. **App Preview** — Optional video (15-30 seconds)

### Submission Steps
1. Archive the app in Xcode
2. Upload to App Store Connect
3. Fill in metadata from \`ios/metadata.json\`
4. Upload screenshots for each device
5. Set pricing and availability
6. Submit for review

### Review Guidelines
- Ensure all features work without login
- Test on all supported devices
- Provide demo account credentials
- Include privacy policy URL

## Google Play Store

### Required Assets
1. **App Icon** — 512x512 PNG
2. **Feature Graphic** — 1024x500 PNG
3. **Screenshots** — At least 2, maximum 8

### Submission Steps
1. Build signed APK/AAB
2. Upload to Google Play Console
3. Fill in store listing from \`android/metadata.json\`
4. Upload screenshots and graphics
5. Set content rating and pricing
6. Submit for review

### Review Guidelines
- Ensure compliance with Play Store policies
- Test on multiple device sizes
- Provide test account credentials
- Include privacy policy URL

## Icon Generation

To generate all required icon sizes, use the \`cap:assets\` script:

\`\`\`bash
npm run cap:assets
\`\`\`

Or manually resize using ImageMagick:

\`\`\`bash
# iOS icons
convert icon-1024.png -resize 180x180 ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60@3x.png

# Android icons
convert icon-1024.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
\`\`\`

## Screenshot Tips

1. **Show key features** — Search, booking, chat, payments
2. **Use real data** — Not placeholder text
3. **Highlight Arabic support** — Show RTL layout
4. **Include emergency feature** — Show 24/7 availability
5. **Show privacy protection** — Highlight masked numbers

## Legal Requirements

- [ ] Privacy Policy URL
- [ ] Terms of Service URL
- [ ] Support URL
- [ ] App rating questionnaire (iOS)
- [ ] Content rating (Android)
- [ ] Data safety form (Android)

## Localization

The app supports:
- English (LTR)
- Arabic (RTL)

Ensure screenshots and descriptions are localized for both languages.
`;

  writeFileSync(join(outputDir, "README.md"), readme);

  console.log("✅ Generated files:");
  console.log(`   📁 ${outputDir}/`);
  console.log("   ├── ios/");
  console.log("   │   ├── metadata.json");
  console.log("   │   ├── description.txt");
  console.log("   │   ├── keywords.txt");
  console.log("   │   └── release-notes.txt");
  console.log("   ├── android/");
  console.log("   │   ├── metadata.json");
  console.log("   │   ├── full-description.txt");
  console.log("   │   └── short-description.txt");
  console.log("   ├── icon-sizes.json");
  console.log("   ├── screenshot-guidelines.json");
  console.log("   └── README.md");
  console.log("\n📱 App store assets generated successfully!");
}

generateFiles();
