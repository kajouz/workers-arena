#!/bin/bash
# WorkersArena Mobile Build Script
# Builds the Next.js app and syncs with Capacitor for iOS and Android

set -e

echo "📱 WorkersArena Mobile Build"
echo "============================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Install dependencies
install_deps() {
    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    npm ci
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Build Next.js app
build_nextjs() {
    echo -e "\n${YELLOW}Building Next.js app...${NC}"
    npm run build
    echo -e "${GREEN}✅ Next.js build complete${NC}"
}

# Generate Capacitor assets
generate_assets() {
    echo -e "\n${YELLOW}Generating Capacitor assets...${NC}"
    npm run cap:assets 2>/dev/null || echo "⚠️  Asset generation skipped (script not found)"
    echo -e "${GREEN}✅ Assets ready${NC}"
}

# Sync Capacitor
sync_capacitor() {
    echo -e "\n${YELLOW}Syncing Capacitor...${NC}"
    npx cap sync
    echo -e "${GREEN}✅ Capacitor sync complete${NC}"
}

# Build iOS
build_ios() {
    echo -e "\n${YELLOW}Building iOS...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v xcodebuild &> /dev/null; then
            cd ios/App
            xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -archivePath build/App.xcarchive archive
            cd ../..
            echo -e "${GREEN}✅ iOS build complete${NC}"
        else
            echo -e "${RED}❌ Xcode not found. Please install Xcode from the App Store.${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ iOS builds require macOS with Xcode${NC}"
        return 1
    fi
}

# Build Android
build_android() {
    echo -e "\n${YELLOW}Building Android...${NC}"
    
    if command -v gradle &> /dev/null || [ -f "./android/gradlew" ]; then
        cd android
        ./gradlew assembleRelease
        cd ..
        echo -e "${GREEN}✅ Android build complete${NC}"
        echo -e "${GREEN}📱 APK: android/app/build/outputs/apk/release/app-release.apk${NC}"
    else
        echo -e "${RED}❌ Android SDK or Gradle not found${NC}"
        return 1
    fi
}

# Main script
main() {
    check_prerequisites
    install_deps
    build_nextjs
    generate_assets
    sync_capacitor
    
    # Parse arguments
    case "${1:-all}" in
        ios)
            build_ios
            ;;
        android)
            build_android
            ;;
        all)
            build_ios || true
            build_android || true
            ;;
        sync)
            echo -e "\n${GREEN}✅ Sync complete. Use 'cap:open:ios' or 'cap:open:android' to open in IDE.${NC}"
            ;;
        *)
            echo "Usage: $0 [ios|android|all|sync]"
            exit 1
            ;;
    esac
    
    echo -e "\n${GREEN}🎉 Build complete!${NC}"
}

main "$@"
