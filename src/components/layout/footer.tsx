"use client";

import Link from "next/link";
import { useState } from "react";
import { Send, Github, Twitter, Instagram, Facebook } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Logo } from "@/components/shared/logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";

export function Footer() {
  const { locale, t, setLocale } = useLocale();
  const [email, setEmail] = useState("");

  const groups = [
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.aboutUs"), href: "#" },
        { label: t("footer.blog"), href: "#" },
        { label: t("footer.careers"), href: "#" },
        { label: t("footer.contact"), href: "#" },
      ],
    },
    {
      title: t("footer.forWorkers"),
      links: [
        { label: t("footer.join"), href: "/auth/register" },
        { label: t("footer.pricing"), href: "/#plans" },
        { label: t("footer.verification"), href: "#" },
        { label: t("footer.faq"), href: "#" },
      ],
    },
    {
      title: t("footer.forCompanies"),
      links: [
        { label: t("footer.advertise"), href: "/company" },
        { label: t("footer.campaigns"), href: "/company" },
        { label: t("footer.support"), href: "#" },
        { label: t("misc.docs"), href: "/api-docs" },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { label: t("footer.privacy"), href: "#" },
        { label: t("footer.terms"), href: "#" },
        { label: t("common.language"), href: "#" },
      ],
    },
  ];

  return (
    <footer className="relative mt-24 border-t border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-950">
      {/* sponsored placement slot */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 border-b border-ink-200/60 px-4 py-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400 sm:px-6 lg:px-8">
        <span className="flex items-center gap-2">
          <Badge variant="outline">{t("featured.sponsored")}</Badge>
          <span className="hidden sm:inline">BuildCo Ltd — trusted construction partner · {t("company.adLearnMore")}</span>
        </span>
        <Link href="/company" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          {t("company.createCampaign")} →
        </Link>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              {t("footer.about")}
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[Github, Twitter, Instagram, Facebook].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label={t("common.followUs")}
                  className="rounded-lg border border-ink-200 p-2 text-ink-500 transition-all hover:border-brand-500/40 hover:text-brand-600 dark:border-ink-800 dark:text-ink-400 dark:hover:text-brand-400"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-5">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800 dark:text-ink-100">
                  {group.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-500 transition-colors hover:text-brand-600 dark:text-ink-400 dark:hover:text-brand-400"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800 dark:text-ink-100">
              {t("footer.news")}
            </h3>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.includes("@")) {
                  toast("success", t("footer.subscribed"));
                  setEmail("");
                }
              }}
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("footer.newsPlaceholder")}
                aria-label={t("footer.newsPlaceholder")}
              />
              <Button type="submit" size="icon" aria-label={t("footer.subscribe")}>
                <Send className="size-4" />
              </Button>
            </form>
            <div className="mt-6 flex items-center gap-2 text-sm">
              <button
                onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
                className="rounded-lg border border-ink-200 px-3 py-1.5 font-semibold text-ink-600 transition-colors hover:border-brand-500/40 hover:text-brand-600 dark:border-ink-800 dark:text-ink-300 dark:hover:text-brand-400"
              >
                {locale === "ar" ? t("misc.languageEnglish") : t("misc.languageArabic")}
              </button>
              <span className="text-xs text-ink-400">{t("misc.switchLocale")}</span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-ink-200/60 pt-6 text-xs text-ink-400 dark:border-ink-800 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {t("app.name")}. {t("common.rights")}
          </p>
          <p className="flex items-center gap-1.5">
            {t("common.madeWith")} <span className="text-brand-500">✦</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
