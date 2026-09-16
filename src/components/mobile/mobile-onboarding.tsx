"use client";

import { useState } from "react";
import {
  Camera,
  MapPin,
  User,
  Check,
  ChevronRight,
  ChevronLeft,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { capturePhoto, compressPhoto } from "@/lib/mobile/camera";
import { dialPrefix } from "@/lib/tenant/countries";

interface MobileOnboardingProps {
  categories: Array<{ slug: string; nameEn: string; nameAr: string; icon: string }>;
  cities: Array<{ slug: string; nameEn: string; nameAr: string }>;
  onComplete: (data: {
    nameEn: string;
    nameAr: string;
    categoryId: string;
    cityId: string;
    phone: string;
    photo?: string;
  }) => void;
}

const SLIDES = [
  { key: "welcome", icon: Star },
  { key: "photo", icon: Camera },
  { key: "details", icon: User },
  { key: "location", icon: MapPin },
] as const;

/**
 * Mobile-first onboarding — a 4-step slide-through for new workers:
 * 1. Welcome + trial info
 * 2. Profile photo capture
 * 3. Name + trade + phone
 * 4. City selection + location permission
 *
 * Designed for the native Capacitor shell — full-screen, swipe-friendly,
 * with large touch targets and haptic feedback on step transitions.
 */
export function MobileOnboarding({
  categories,
  cities,
  onComplete,
}: MobileOnboardingProps) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState("");

  const isLast = step === SLIDES.length - 1;
  const canAdvance = step === 0 || (step === 2 && nameEn && nameAr && categoryId && phone) || (step === 3 && cityId) || step === 1;

  const handlePhotoCapture = async () => {
    const result = await capturePhoto({ quality: 80 });
    if (result) {
      const compressed = await compressPhoto(result.dataUrl, 600, 70);
      setPhoto(compressed);
    }
  };

  const handleComplete = () => {
    onComplete({
      nameEn,
      nameAr,
      categoryId,
      cityId,
      phone: `${dialPrefix()} ${phone}`.trim(),
      photo: photo ?? undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-12 pb-4">
        {SLIDES.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === step ? "w-8 bg-brand-500" : i < step ? "w-2 bg-brand-300" : "w-2 bg-muted"
            )}
          />
        ))}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center px-6">
        {step === 0 && (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-right">
            <div className="w-20 h-20 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto">
              <Star className="h-10 w-10 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Welcome to WorkersArena
              </h1>
              <p className="text-muted-foreground mt-2">
                Your 30-day free trial starts now. No credit card required.
              </p>
            </div>
            <div className="bg-brand-500/5 rounded-xl p-4 text-sm text-brand-700 dark:text-brand-300">
              🎉 Get access to qualified leads, booking management, and payment tracking — all free for 30 days.
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-right">
            <div className="w-32 h-32 rounded-full bg-muted mx-auto overflow-hidden border-4 border-brand-500/20">
              {photo ? (
                <img src={photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">Add a profile photo</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Workers with photos get 3× more bookings
              </p>
            </div>
            <Button onClick={handlePhotoCapture} variant="outline" size="lg" className="w-full">
              <Camera className="h-5 w-5 mr-2" />
              {photo ? "Retake photo" : "Take photo"}
            </Button>
            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground underline"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 w-full max-w-sm animate-in fade-in slide-in-from-right">
            <h2 className="text-xl font-bold text-center">Your details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Name (English)</label>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Ahmad Khalil"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Name (Arabic)</label>
                <Input
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: أحمد خليل"
                  dir="rtl"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Trade</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                >
                  <option value="">Select your trade…</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.nameEn}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <div className="flex gap-2 mt-1">
                  <span className="flex items-center px-3 border rounded-md text-sm bg-muted">
                    {dialPrefix()}
                  </span>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="70 000 000"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 w-full max-w-sm animate-in fade-in slide-in-from-right">
            <h2 className="text-xl font-bold text-center">Where do you work?</h2>
            <p className="text-sm text-muted-foreground text-center">
              Select your city to receive nearby job requests.
            </p>
            <div className="space-y-2">
              {cities.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setCityId(c.slug)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                    cityId === c.slug
                      ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500"
                      : "border-border hover:border-brand-500/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{c.nameEn}</span>
                  </div>
                  {cityId === c.slug && <Check className="h-5 w-5 text-brand-500" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="p-6 flex gap-3">
        {step > 0 && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => setStep((s) => s - 1)}
            className="flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <Button
          size="lg"
          className="flex-1"
          disabled={!canAdvance}
          onClick={() => {
            if (isLast) {
              handleComplete();
            } else {
              setStep((s) => s + 1);
            }
          }}
        >
          {isLast ? "Start my free trial" : "Continue"}
          {!isLast && <ChevronRight className="h-5 w-5 ml-2" />}
        </Button>
      </div>
    </div>
  );
}
