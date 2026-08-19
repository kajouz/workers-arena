"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface OnboardingStep {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  target?: string; // CSS selector for the element to highlight
  position?: "top" | "bottom" | "left" | "right";
}

interface OnboardingContextType {
  isActive: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  startOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  isCompleted: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to WorkersArena",
    titleAr: "مرحباً بكم في WorkersArena",
    description:
      "Find trusted professionals for any job — from plumbers to electricians. Let's show you around!",
    descriptionAr:
      "ابحث عن متخصصين موثوقين لأي عمل — من السباكين إلى الكهربائيين. دعنا نريك المكان!",
  },
  {
    id: "search",
    title: "Search & Filter",
    titleAr: "البحث والفلترة",
    description:
      "Use the search bar to find workers by trade, city, or name. Apply filters to narrow down results.",
    descriptionAr:
      "استخدم شريط البحث للعثور على العمال حسب المهنة أو المدينة أو الاسم. استخدم الفلاتر لتضييق النتائج.",
    target: "[data-onboarding='search']",
    position: "bottom",
  },
  {
    id: "categories",
    title: "Browse by Category",
    titleAr: "تصفح حسب الفئة",
    description:
      "Explore all available trades — tap any category to see workers in that field.",
    descriptionAr:
      "استكشف جميع المتاحين — اضغط على أي فئة لرؤية العمال في هذا المجال.",
    target: "[data-onboarding='categories']",
    position: "top",
  },
  {
    id: "favorites",
    title: "Save Your Favorites",
    titleAr: "احفظ المفضلة لديك",
    description:
      "Tap the heart icon on any worker card to save them. Find all your favorites in one place.",
    descriptionAr:
      "اضغط على أيقونة القلب على بطاقة أي عامل لحفظه. اعثر على جميع المفضلة لديك في مكان واحد.",
  },
  {
    id: "book",
    title: "Book a Worker",
    titleAr: "احجز عامل",
    description:
      "Ready to hire? Tap 'Contact' or 'Book' on a worker's profile to request their services.",
    descriptionAr:
      "مستعد للتوظيف؟ اضغط على 'تواصل' أو 'احجز' على ملف العامل لطلب خدماته.",
  },
  {
    id: "offline",
    title: "Works Offline",
    titleAr: "يعمل بدون إنترنت",
    description:
      "WorkersArena works even without internet! Recently viewed workers and search results are available offline.",
    descriptionAr:
      "يعمل WorkersArena حتى بدون إنترنت! العمال الذين شاهدتهم مؤخراً ونتائج البحث متاحون بدون إنترنت.",
  },
];

const OnboardingContext = createContext<OnboardingContextType | null>(null);

const STORAGE_KEY = "wa_onboarding_completed";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    setIsCompleted(!!completed);
  }, []);

  const startOnboarding = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const skipOnboarding = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, "skipped");
    setIsCompleted(true);
  }, []);

  const completeOnboarding = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, "completed");
    setIsCompleted(true);
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        steps: ONBOARDING_STEPS,
        startOnboarding,
        nextStep,
        prevStep,
        skipOnboarding,
        completeOnboarding,
        isCompleted,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
