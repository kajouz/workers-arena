"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, LogIn, ShieldCheck, UserRound, Building2, HardHat } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Logo } from "@/components/shared/logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginAction, loginDemoAction, type AuthActionState } from "@/app/actions/auth";
import { useActionState } from "react";
import type { SessionRole } from "@/lib/auth-demo";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type Values = z.infer<typeof schema>;

const DEMO_ROLES: { role: SessionRole; icon: React.ReactNode; labelKey: string }[] = [
  { role: "customer", icon: <UserRound className="size-4" />, labelKey: "auth.demoCustomer" },
  { role: "worker", icon: <HardHat className="size-4" />, labelKey: "auth.demoWorker" },
  { role: "company", icon: <Building2 className="size-4" />, labelKey: "auth.demoCompany" },
  { role: "admin", icon: <ShieldCheck className="size-4" />, labelKey: "auth.demoAdmin" },
];

export default function LoginPage() {
  const { locale, t } = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [demoBusy, setDemoBusy] = useState<SessionRole | null>(null);

  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(loginAction, {});

  const {
    register,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-ink-50 dark:from-ink-900 dark:via-ink-950 dark:to-ink-950" />
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" />
      <div className="absolute -top-20 start-1/3 size-96 rounded-full bg-brand-400/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="glass-strong rounded-3xl p-8 shadow-lift">
          <h1 className="text-2xl font-black text-ink-900 dark:text-ink-50">{t("auth.loginTitle")}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("auth.loginSubtitle")}</p>

          {state.error && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400">
              {t(`auth.${state.error}`)}
            </p>
          )}

          <form action={formAction} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-red-500">{t("auth.emailInvalid")}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <button type="button" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  {t("auth.forgot")}
                </button>
              </div>
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
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                  aria-label="Toggle password"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{t("auth.passwordMin")}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              <LogIn className="size-4" />
              {pending ? t("common.loading") : t("common.login")}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500 dark:text-ink-400">
            {t("auth.noAccount")}{" "}
            <Link href="/auth/register" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
              {t("auth.register")}
              <ArrowRight className="ms-0.5 inline size-3.5 rtl:rotate-180" />
            </Link>
          </p>
        </div>

        {/* demo accounts */}
        <div className="mt-5 rounded-2xl border border-dashed border-brand-500/30 bg-brand-500/5 p-5">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
            {t("auth.demoTitle")}
          </p>
          <p className="mt-1 text-center text-xs text-ink-500 dark:text-ink-400">{t("auth.demoTip")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ROLES.map((d) => (
              <button
                key={d.role}
                disabled={demoBusy === d.role}
                onClick={async () => {
                  setDemoBusy(d.role);
                  await loginDemoAction(d.role);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm font-bold text-ink-700 transition-all hover:border-brand-500/50 hover:text-brand-600 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:text-brand-400"
              >
                {d.icon}
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
