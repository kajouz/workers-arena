"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, UserPlus } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Logo } from "@/components/shared/logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { registerAction, type AuthActionState } from "@/app/actions/auth";

const schema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
    phone: z.string().min(8).optional(),
    role: z.enum(["customer", "worker", "company"]),
    terms: z.literal(true),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"] });

type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const { t } = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(registerAction, {});

  const {
    register,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const roles: { value: "customer" | "worker" | "company"; label: string }[] = [
    { value: "customer", label: t("auth.roleCustomer") },
    { value: "worker", label: t("auth.roleWorker") },
    { value: "company", label: t("auth.roleCompany") },
  ];

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-ink-50 dark:from-ink-900 dark:via-ink-950 dark:to-ink-950" />
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" />
      <div className="absolute -top-20 end-1/3 size-96 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="glass-strong rounded-3xl p-8 shadow-lift">
          <h1 className="text-2xl font-black text-ink-900 dark:text-ink-50">{t("auth.registerTitle")}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("auth.registerSubtitle")}</p>

          {state.error && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400">
              {t(`auth.${state.error}`)}
            </p>
          )}

          <form action={formAction} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input id="name" placeholder="Ahmed Ali" {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{t("auth.nameMin")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-red-500">{t("auth.emailInvalid")}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...register("password")}
                    className="pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
                    aria-label="Toggle password"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500">{t("auth.passwordMin")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-red-500">{t("auth.match")}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("auth.phone")}</Label>
              <Input id="phone" type="tel" placeholder="+966 5X XXX XXXX" {...register("phone")} />
            </div>

            <div className="space-y-1.5">
              <Label>{t("auth.role")}</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("auth.role")}>
                {roles.map((r) => (
                  <label
                    key={r.value}
                    className="flex cursor-pointer items-center justify-center rounded-xl border border-ink-200 px-3 py-2.5 text-xs font-bold text-ink-600 transition-all has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-brand-700 dark:border-ink-700 dark:text-ink-300 dark:has-[:checked]:text-brand-400"
                  >
                    <input type="radio" value={r.value} defaultChecked={r.value === "customer"} className="sr-only" {...register("role")} />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-ink-500 dark:text-ink-400">
              <input type="checkbox" defaultChecked {...register("terms")} className="mt-0.5 size-4 accent-brand-500" />
              {t("auth.terms")}
            </label>
            {errors.terms && <p className="text-xs text-red-500">{t("auth.required")}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <UserPlus className="size-4" />
              {pending ? t("common.loading") : t("auth.register")}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500 dark:text-ink-400">
            {t("auth.haveAccount")}{" "}
            <Link href="/auth/login" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
              {t("common.login")}
              <ArrowLeft className="ms-0.5 inline size-3.5 rtl:rotate-180" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
