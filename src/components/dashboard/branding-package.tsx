"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Palette,
  Link2,
  CreditCard,
  Share2,
  Video,
  Shield,
  Download,
  Check,
  ExternalLink,
  Sparkles,
  Crown,
  Star,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandingFeature {
  id: string;
  icon: React.ElementType;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  priceType: "one-time" | "monthly";
  enabled: boolean;
  claimed?: boolean;
}

interface BrandingConfig {
  customUrlEnabled: boolean;
  businessCardEnabled: boolean;
  socialKitEnabled: boolean;
  profileThemeEnabled: boolean;
  videoIntroEnabled: boolean;
  verifiedBusinessEnabled: boolean;
  customUrl?: string;
  accentColor?: string;
  cardDesign?: string;
  frameStyle?: string;
}

// ─── Feature Definitions ──────────────────────────────────────────────────────

const BRANDING_FEATURES: Omit<BrandingFeature, "enabled">[] = [
  {
    id: "custom_url",
    icon: Link2,
    name: "Custom Profile URL",
    nameAr: "رابط الملف الشخصي المخصص",
    description: "Get a memorable URL like workersarena.com/your-name",
    descriptionAr: "احصل على رابط مميز مثل workersarena.com/your-name",
    price: 10,
    priceType: "one-time",
  },
  {
    id: "business_card",
    icon: CreditCard,
    name: "Business Card Generator",
    nameAr: "مولد بطاقات العمل",
    description: "Download printable PDF business cards with QR code",
    descriptionAr: "حمّل بطاقات عمل PDF مع رمز QR",
    price: 15,
    priceType: "one-time",
  },
  {
    id: "social_kit",
    icon: Share2,
    name: "Social Media Kit",
    nameAr: "أدوات التواصل الاجتماعي",
    description: "Profile images, story templates, and review cards",
    descriptionAr: "صور الملف الشخصي، قوالب القصص، وبطاقات المراجعات",
    price: 15,
    priceType: "one-time",
  },
  {
    id: "profile_theme",
    icon: Palette,
    name: "Custom Profile Theme",
    nameAr: "سمة الملف الشخصي المخصصة",
    description: "Choose accent colors, banner image, and profile frame",
    descriptionAr: "اختر الألوان، صورة البانر، وإطار الملف الشخصي",
    price: 3,
    priceType: "monthly",
  },
  {
    id: "video_intro",
    icon: Video,
    name: "Profile Video Introduction",
    nameAr: "فيديو تعريفي بالملف الشخصي",
    description: "30-second video introduction on your profile",
    descriptionAr: "فيديو تعريفي مدته 30 ثانية على ملفك الشخصي",
    price: 20,
    priceType: "one-time",
  },
  {
    id: "verified_business",
    icon: Shield,
    name: "Verified Business Badge",
    nameAr: "شارة الأعمال الموثقة",
    description: "Gold shield badge with company verification",
    descriptionAr: "شارة درع ذهبية مع التحقق من الشركة",
    price: 5,
    priceType: "monthly",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function BrandingPackage() {
  const [config, setConfig] = useState<BrandingConfig>({
    customUrlEnabled: false,
    businessCardEnabled: false,
    socialKitEnabled: false,
    profileThemeEnabled: false,
    videoIntroEnabled: false,
    verifiedBusinessEnabled: false,
  });
  const [features, setFeatures] = useState<BrandingFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#f97316");
  const [selectedDesign, setSelectedDesign] = useState("modern");
  const [selectedFrame, setSelectedFrame] = useState("none");

  useEffect(() => {
    fetchBrandingConfig();
  }, []);

  const fetchBrandingConfig = async () => {
    try {
      const response = await fetch("/api/worker/branding");
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config || config);
        setCustomUrl(data.config?.customUrl || "");
        setAccentColor(data.config?.accentColor || "#f97316");
        setSelectedDesign(data.config?.cardDesign || "modern");
        setSelectedFrame(data.config?.frameStyle || "none");
      }
    } catch (error) {
      console.error("Error fetching branding config:", error);
    } finally {
      setLoading(false);
    }

    // Map config to features
    setFeatures(
      BRANDING_FEATURES.map((f) => ({
        ...f,
        enabled: config[`${f.id}Enabled` as keyof BrandingConfig] as boolean,
      }))
    );
  };

  const handleToggleFeature = async (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    // If enabling, show confirmation with price
    if (!feature.enabled) {
      const confirmed = window.confirm(
        `Enable ${feature.name} for $${feature.price}${feature.priceType === "monthly" ? "/month" : ""}?`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/worker/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [`${featureId}Enabled`]: !feature.enabled,
        }),
      });

      if (response.ok) {
        setFeatures(
          features.map((f) =>
            f.id === featureId ? { ...f, enabled: !f.enabled } : f
          )
        );
        setConfig({
          ...config,
          [`${featureId}Enabled`]: !feature.enabled,
        });
      }
    } catch (error) {
      console.error("Error toggling feature:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomUrl = async () => {
    if (!customUrl.trim()) return;

    setSaving(true);
    try {
      const response = await fetch("/api/worker/branding/custom-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: customUrl }),
      });

      if (response.ok) {
        setConfig({ ...config, customUrl: customUrl, customUrlEnabled: true });
        alert("Custom URL saved successfully!");
      }
    } catch (error) {
      console.error("Error saving custom URL:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTheme = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/worker/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accentColor,
          cardDesign: selectedDesign,
          frameStyle: selectedFrame,
        }),
      });

      if (response.ok) {
        setConfig({
          ...config,
          accentColor,
          cardDesign: selectedDesign,
          frameStyle: selectedFrame,
          profileThemeEnabled: true,
        });
        alert("Theme saved successfully!");
      }
    } catch (error) {
      console.error("Error saving theme:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBusinessCard = async () => {
    try {
      const response = await fetch(
        `/api/worker/branding/business-card?design=${selectedDesign}`
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `business-card-${selectedDesign}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error downloading business card:", error);
    }
  };

  const handleDownloadSocialKit = async () => {
    try {
      const response = await fetch("/api/worker/branding/social-kit");
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "social-media-kit.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error downloading social kit:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const totalSetupCost = features
    .filter((f) => f.priceType === "one-time" && !f.enabled)
    .reduce((sum, f) => sum + f.price, 0);

  const totalMonthlyCost = features
    .filter((f) => f.priceType === "monthly" && !f.enabled)
    .reduce((sum, f) => sum + f.price, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/20 p-3">
            <Palette className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Worker Branding Package</h2>
            <p className="text-white/80">
              Build your professional brand and stand out from the competition
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-4">
          <div className="rounded-lg bg-white/10 px-4 py-2">
            <p className="text-xs text-white/70">Setup Cost</p>
            <p className="text-lg font-bold">${totalSetupCost}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-4 py-2">
            <p className="text-xs text-white/70">Monthly</p>
            <p className="text-lg font-bold">${totalMonthlyCost}/mo</p>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className={cn(
                "rounded-xl border-2 p-4 transition-all",
                feature.enabled
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 bg-white hover:border-brand-300"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-lg p-2",
                      feature.enabled ? "bg-green-100" : "bg-gray-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-5",
                        feature.enabled
                          ? "text-green-600"
                          : "text-gray-500"
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{feature.name}</p>
                    <p className="text-xs text-gray-500">{feature.nameAr}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature(feature.id)}
                  disabled={saving}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    feature.enabled ? "bg-green-500" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      feature.enabled && "translate-x-5"
                    )}
                  />
                </button>
              </div>

              <p className="mt-3 text-sm text-gray-600">{feature.description}</p>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {feature.priceType === "one-time" ? (
                    <Zap className="size-3 text-amber-500" />
                  ) : (
                    <Star className="size-3 text-purple-500" />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    ${feature.price}
                    {feature.priceType === "monthly" && "/mo"}
                  </span>
                </div>
                {feature.enabled && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="size-3" />
                    Active
                  </span>
                )}
              </div>

              {/* Feature-specific actions */}
              {feature.enabled && feature.id === "custom_url" && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="your-name"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleSaveCustomUrl}
                      disabled={saving || !customUrl.trim()}
                      className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                    >
                      Save
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    workersarena.com/{customUrl || "your-name"}
                  </p>
                </div>
              )}

              {feature.enabled && feature.id === "business_card" && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    {["classic", "modern", "bold"].map((design) => (
                      <button
                        key={design}
                        onClick={() => setSelectedDesign(design)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize",
                          selectedDesign === design
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        {design}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleDownloadBusinessCard}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    <Download className="size-4" />
                    Download PDF
                  </button>
                </div>
              )}

              {feature.enabled && feature.id === "social_kit" && (
                <div className="mt-3">
                  <button
                    onClick={handleDownloadSocialKit}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    <Download className="size-4" />
                    Download Kit (ZIP)
                  </button>
                </div>
              )}

              {feature.enabled && feature.id === "profile_theme" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Accent Color
                    </label>
                    <div className="mt-1 flex gap-2">
                      {["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"].map(
                        (color) => (
                          <button
                            key={color}
                            onClick={() => setAccentColor(color)}
                            className={cn(
                              "h-8 w-8 rounded-full border-2",
                              accentColor === color
                                ? "border-gray-900 scale-110"
                                : "border-gray-200"
                            )}
                            style={{ backgroundColor: color }}
                          />
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Card Design
                    </label>
                    <div className="mt-1 flex gap-2">
                      {["classic", "modern", "bold"].map((design) => (
                        <button
                          key={design}
                          onClick={() => setSelectedDesign(design)}
                          className={cn(
                            "flex-1 rounded-lg border px-2 py-1 text-xs capitalize",
                            selectedDesign === design
                              ? "border-brand-500 bg-brand-50"
                              : "border-gray-200"
                          )}
                        >
                          {design}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Profile Frame
                    </label>
                    <div className="mt-1 flex gap-2">
                      {["none", "gold", "silver", "bronze"].map((frame) => (
                        <button
                          key={frame}
                          onClick={() => setSelectedFrame(frame)}
                          className={cn(
                            "flex-1 rounded-lg border px-2 py-1 text-xs capitalize",
                            selectedFrame === frame
                              ? "border-brand-500 bg-brand-50"
                              : "border-gray-200"
                          )}
                        >
                          {frame}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleSaveTheme}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    <Sparkles className="size-4" />
                    Apply Theme
                  </button>
                </div>
              )}

              {feature.enabled && feature.id === "video_intro" && (
                <div className="mt-3">
                  <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                    <Video className="mx-auto size-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600">
                      Upload a 30-second video introduction
                    </p>
                    <button className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                      Choose Video
                    </button>
                  </div>
                </div>
              )}

              {feature.enabled && feature.id === "verified_business" && (
                <div className="mt-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2">
                      <Crown className="size-4 text-amber-600" />
                      <p className="text-sm font-medium text-amber-800">
                        Verification Pending
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-amber-700">
                      Submit your business documents for verification
                    </p>
                    <button className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                      Start Verification
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bundle Offers */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <h3 className="text-lg font-bold text-gray-900">Bundle & Save</h3>
        <p className="text-sm text-gray-600">
          Get multiple features at a discounted rate
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="font-semibold text-gray-900">Starter Kit</h4>
            <p className="text-sm text-gray-600">Custom URL + Business Card</p>
            <p className="mt-2 text-2xl font-bold text-brand-600">$20</p>
            <p className="text-xs text-gray-500">Save $5</p>
            <button className="mt-3 w-full rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">
              Get Starter
            </button>
          </div>
          <div className="relative rounded-lg border-2 border-brand-500 bg-white p-4">
            <span className="absolute -top-2.5 left-4 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">
              Popular
            </span>
            <h4 className="font-semibold text-gray-900">Social Pro</h4>
            <p className="text-sm text-gray-600">
              URL + Business Card + Social Kit
            </p>
            <p className="mt-2 text-2xl font-bold text-brand-600">$35</p>
            <p className="text-xs text-gray-500">Save $10</p>
            <button className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
              Get Social Pro
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="font-semibold text-gray-900">Full Branding</h4>
            <p className="text-sm text-gray-600">All features included</p>
            <p className="mt-2 text-2xl font-bold text-brand-600">
              $50 + $5/mo
            </p>
            <p className="text-xs text-gray-500">Save $30+</p>
            <button className="mt-3 w-full rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">
              Get Full Branding
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
