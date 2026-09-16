"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkerProfileAction, type OnboardState } from "@/app/actions/onboarding";
import { dialPrefix } from "@/lib/tenant/countries";
import type { Category, City } from "@/lib/data/types";

interface FlatArea {
  slug: string;
  nameEn: string;
  nameAr: string;
  citySlug: string;
  cityName: string;
}

export function OnboardingForm({
  categories,
  cities,
  areas,
  defaultName,
  locale,
}: {
  categories: Category[];
  cities: City[];
  areas: FlatArea[];
  defaultName: string;
  locale: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<OnboardState, FormData>(
    createWorkerProfileAction,
    null
  );

  // If the action succeeded (redirect happened), the router will navigate.
  // If there's an error, show it.
  const errorLabel =
    state?.error === "required"
      ? "Please fill in all required fields."
      : state?.error === "unauthorized"
        ? "Please log in again."
        : state?.error === "server"
          ? "Something went wrong. Please try again."
          : null;

  return (
    <form action={formAction} className="space-y-4 bg-card p-6 rounded-xl border shadow-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name (English)</label>
          <Input name="nameEn" defaultValue={defaultName} required maxLength={100} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name (Arabic)</label>
          <Input name="nameAr" required maxLength={100} dir="rtl" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Trade / Category</label>
        <select
          name="categoryId"
          required
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Select your trade…</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {locale === "ar" ? c.nameAr : c.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <select
            name="cityId"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Select city…</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {locale === "ar" ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Area</label>
          <select
            name="areaId"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Select area…</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {locale === "ar" ? a.nameAr : a.nameEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Phone</label>
        <Input name="phone" required placeholder={`${dialPrefix()} 70 000 000`} maxLength={30} />
      </div>

      {errorLabel && (
        <p className="text-sm text-destructive">{errorLabel}</p>
      )}

      <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
        🎉 Your <strong>30-day free trial</strong> starts today. You won&apos;t be charged until
        the trial ends. Cancel anytime.
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating profile…" : "Start My Free Trial"}
      </Button>
    </form>
  );
}
