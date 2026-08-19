#!/bin/bash
set -e

echo "🏗️  Building WorkersArena Mobile Apps"
echo "======================================"

# Check if Capacitor is installed
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js"
    exit 1
fi

# Check for iOS/Android directories
if [ ! -d "ios" ] && [ ! -d "android" ]; then
    echo "📱 Adding native platforms..."
    npx cap add ios
    npx cap add android
fi

echo ""
echo "🔨 Step 1: Building Next.js..."
npm run build

echo ""
echo "📱 Step 2: Syncing with Capacitor..."
npx cap sync

echo ""
echo "🎨 Step 3: Updating native icons..."
npx cap copy

echo ""
echo "✅ Build complete!"
echo ""
echo "To open in native IDEs:"
echo "  iOS:     npx cap open ios"
echo "  Android: npx cap open android"
echo ""
echo "To run on device:"
echo "  iOS:     npx cap run ios"
echo "  Android: npx cap run android"
