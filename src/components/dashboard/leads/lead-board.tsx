"use client";

/**
 * §7–§10 — the worker's LEAD MARKETPLACE board (docs/lead-marketplace.md).
 *
 * Everything money- or privacy-shaped about a row is decided SERVER-SIDE by the
 * pure engine (`leadBoardItemFor` in `lib/data/lead-market.ts`): the grade, the
 * credit price, the countdown window, whether the offer is still buyable, and
 * how much of the customer's identity this viewer may see. This component only
 * renders those decisions — it never masks, prices or reveals anything itself,
 * so the board cannot be the surface that leaks a customer's phone number.
 */

import { useState } from "react";
import {
  BadgeCheck,
  Ban,
  Clock,
  Flame,
  Gem,
  Lock,
  Mail,
  Medal,
  Phone,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/providers/locale-provider";
import { useCountdownTick } from "@/hooks/use-countdown-tick";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn, formatDate, formatNumber, formatPrice } from "@/lib/utils";
import type { LeadGrade, LeadBoardItem } from "@/lib/data/lead-market";
import type { WorkerLeadBoard } from "@/lib/data/repo";
import { buyLeadOfferAction, submitLeadRatingAction } from "@/app/actions/leads";

/** Bronze/silver/gold/emergency → the badge look + icon the row wears. */
const GRADE_STYLE: Record<LeadGrade, { className: string; icon: typeof Medal; variant: "secondary" | "outline" | "premium" | "danger" }> = {
  bronze: { className: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-400", icon: Medal, variant: "outline" },
  silver: { className: "border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300", icon: Gem, variant: "secondary" },
  gold: { className: "border-amber-400/40 bg-amber-400/15 text-amber-700 dark:text-amber-300", icon: Sparkles, variant: "premium" },
  emergency: { className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400", icon: Flame, variant: "danger" },
};

type Tab = "available" | "owned" | "history";

export function LeadBoard({
  board,
  nowSeed,
}: {
  board: WorkerLeadBoard;
  /** Date.now() at server render time — the hydration-safe countdown seed. */
  nowSeed: number;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(board.live.length > 0 ? "available" : board.owned.length > 0 ? "owned" : "available");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);

  // One shared clock for every countdown on the page (paused while hidden,
  // resynced on visibility) — seeded from the server so SSR and the first
  // client render agree, then ticking to the real deadline.
  const now = useCountdownTick(true, 15_000);
  const mount = nowSeed;

  const items = tab === "available" ? board.live : tab === "owned" ? board.owned : board.past;

  const buy = async (item: LeadBoardItem) => {
    setPendingId(item.offer.id);
    const result = await buyLeadOfferAction(item.offer.id);
    setPendingId(null);
    if (result.ok) {
      setOwnedIds((ids) => [...ids, item.offer.id]);
      toast("success", t("leadMarket.unlockToast"));
      // The customer's details are NOT in this payload — the server masked them
      // for a non-buyer (§10), so the unlocked version has to be re-fetched
      // rather than unmasked on the client (there is nothing to unmask).
      router.refresh();
      return;
    }
    const key = `leadMarket.errors.${result.error === "insufficient-credits" ? "insufficient" : result.error === "not-live" ? "notLive" : result.error === "not-found" ? "notFound" : result.error === "already-owned" ? "alreadyOwned" : result.error === "already-charged" ? "alreadyCharged" : result.error}`;
    toast("error", t(key));
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("leadMarket.title")}</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.subtitle")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-ink-500 dark:text-ink-400">{t("leadMarket.balanceLabel")}</p>
              <p className="text-xl font-bold tabular-nums">
                {formatNumber(board.balance.balance)} <span className="text-sm font-medium text-ink-500 dark:text-ink-400">{t("promotions.credits")}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="self-center space-y-1 sm:col-span-2">
          <p className="text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.balanceHint")}</p>
          {/* §11 — what the leads have given back. This is the number that
              decides whether a worker keeps buying leads, so it sits with the
              balance rather than buried in a booking. */}
          {board.rebates.count > 0 ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Badge variant="success" className="gap-1 tabular-nums">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t("leadMarket.rebateBadge", {
                  amount: formatPrice(board.rebates.totalMinor / 100, "USD", locale),
                })}
              </Badge>
              <span>{t("leadMarket.rebateSummary", { count: board.rebates.count })}</span>
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            {t("leadMarket.howTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-300">{t("leadMarket.howBody")}</p>
          <div className="flex flex-wrap gap-2">
            {(["bronze", "silver", "gold", "emergency"] as LeadGrade[]).map((grade) => (
              <Badge key={grade} variant={GRADE_STYLE[grade].variant} className={cn("font-semibold", GRADE_STYLE[grade].className)}>
                {t(`leadMarket.grade.${grade}`)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            ["available", board.live.length],
            ["owned", board.owned.length],
            ["history", board.past.length],
          ] as Array<[Tab, number]>
        ).map(([key, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                : "border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-300 dark:hover:bg-ink-900"
            )}
          >
            {t(`leadMarket.tabs.${key}`)}
            {count > 0 ? <span className="ms-1.5 text-xs tabular-nums opacity-70">{count}</span> : null}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-500 dark:text-ink-400">
            {t(`leadMarket.empty${tab === "available" ? "Available" : tab === "owned" ? "Owned" : "History"}`)}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <LeadRow
              key={item.offer.id}
              item={item}
              now={now > mount ? now : mount}
              pending={pendingId === item.offer.id}
              justOwned={ownedIds.includes(item.offer.id)}
              onBuy={() => buy(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadRow({
  item,
  now,
  pending,
  justOwned,
  onBuy,
}: {
  item: LeadBoardItem;
  now: number;
  pending: boolean;
  justOwned: boolean;
  onBuy: () => void;
}) {
  const { locale, t } = useLocale();
  const style = GRADE_STYLE[item.offer.grade] ?? GRADE_STYLE.bronze;
  const GradeIcon = style.icon;
  const owned = item.purchased || justOwned;
  const minutesLeft = Math.max(0, Math.ceil((Date.parse(item.offer.expiresAt) - now) / 60_000));
  const live = item.live || justOwned;

  // "Why you were matched" — the signals the matcher ACTUALLY scored points on,
  // computed server-side by the same ranking function that created the offer.
  const reasons = item.reasons.map((signal) => t(`leadMarket.reason.${signal}`));

  return (
    <Card className={cn("overflow-hidden", !live && !owned && "opacity-70")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={style.variant} className={cn("gap-1 font-semibold", style.className)}>
                <GradeIcon className="h-3.5 w-3.5" />
                {t(`leadMarket.grade.${item.offer.grade}`)}
              </Badge>
              <Badge variant={item.offer.exclusive ? "premium" : "outline"} className="font-medium">
                {item.offer.exclusive ? t("leadMarket.exclusiveBadge") : t("leadMarket.sharedBadge")}
              </Badge>
              <span className="font-mono text-xs text-ink-500 dark:text-ink-400">{item.lead.number}</span>
            </div>
            <h3 className="text-base font-semibold">{item.lead.jobTitle}</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {item.lead.serviceNameEn ?? t("leadMarket.noService")} · {item.lead.categorySlug} · {item.lead.citySlug}
              {item.lead.createdAt ? ` · ${formatDate(item.lead.createdAt, locale)}` : ""}
            </p>
          </div>
          <div className="text-end">
            <p className="text-lg font-bold tabular-nums">
              {item.price.credits} <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{t("promotions.credits")}</span>
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {owned ? t("leadMarket.yourPrice", { credits: item.offer.priceCredits }) : t("leadMarket.matchScore", { score: item.offer.matchScore })}
            </p>
          </div>
        </div>

        {item.lead.note ? (
          <p className="line-clamp-2 text-sm text-ink-600 dark:text-ink-300">{item.lead.note}</p>
        ) : null}

        {reasons.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-ink-500 dark:text-ink-400">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("leadMarket.scoreWhy", { reasons: reasons.join(" · ") })}
          </p>
        ) : null}

        {/* §11 — this lead already paid for itself: the jobs it produced gave
            back more (or all) of what it cost. */}
        {item.rebateMinor > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Badge variant="success" className="text-[10px] tabular-nums">
              {t("leadMarket.rebateBadge", { amount: formatPrice(item.rebateMinor / 100, "USD", locale) })}
            </Badge>
            <span>
              {item.rebateMinor >= item.price.amountMinor
                ? t("leadMarket.rebatePaidForItself")
                : t("leadMarket.rebatePartial", {
                    remaining: formatPrice((item.price.amountMinor - item.rebateMinor) / 100, "USD", locale),
                  })}
            </span>
          </p>
        ) : null}

        {/* §12 — Rating section: only on purchased leads that haven't been rated yet */}
        {owned && item.offer.status === "purchased" && (
          <LeadRatingRow offerId={item.offer.id} leadNumber={item.lead.number} grade={item.offer.grade} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3 dark:border-ink-800">
          <div className="flex flex-wrap items-center gap-3">
            {owned ? (
              <ContactDetails item={item} />
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
                <Lock className="h-3.5 w-3.5" />
                {item.reveal === "masked" ? t("leadMarket.contactMasked") : t("leadMarket.contactLocked")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusPill
              live={live}
              owned={owned}
              status={item.offer.status}
              minutesLeft={minutesLeft}
            />
            {!owned && live ? (
              <Button size="sm" onClick={onBuy} disabled={pending}>
                {pending ? t("leadMarket.buying") : t("leadMarket.price", { credits: item.price.credits })}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The buyer's view of the customer — already masked/revealed by the server. */
function ContactDetails({ item }: { item: LeadBoardItem }) {
  const { t } = useLocale();
  const rows: Array<[typeof User, string, string]> = [
    [User, t("leadMarket.contactName"), item.contact.name],
    [Phone, t("leadMarket.contactPhone"), item.contact.phone],
    [Mail, t("leadMarket.contactEmail"), item.contact.email],
  ];
  const visible = rows.filter(([, , value]) => Boolean(value));
  if (visible.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
        <Lock className="h-3.5 w-3.5" />
        {t("leadMarket.contactMasked")}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {visible.map(([Icon, label, value]) => (
        <span key={label} className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-ink-400" />
          <span className="text-ink-500 dark:text-ink-400">{label}</span>
          <span dir="ltr" className="font-medium tabular-nums">{value}</span>
        </span>
      ))}
    </div>
  );
}

/** Live countdown, purchased mark, or why the offer is no longer buyable. */
function StatusPill({
  live,
  owned,
  status,
  minutesLeft,
}: {
  live: boolean;
  owned: boolean;
  status: string;
  minutesLeft: number;
}) {
  const { t } = useLocale();
  if (owned) {
    return (
      <Badge variant="success" className="gap-1">
        <BadgeCheck className="h-3.5 w-3.5" />
        {t("leadMarket.owned")}
      </Badge>
    );
  }
  if (live) {
    return (
      <Badge variant={minutesLeft <= 15 ? "danger" : "outline"} className="gap-1 tabular-nums">
        <Clock className="h-3.5 w-3.5" />
        {t("leadMarket.expiresIn", { minutes: minutesLeft })}
      </Badge>
    );
  }
  const label =
    status === "revoked"
      ? t("leadMarket.revokedLabel")
      : status === "declined"
        ? t("leadMarket.declinedLabel")
        : t("leadMarket.expiredLabel");
  return (
    <Badge variant="outline" className="gap-1 text-ink-500 dark:text-ink-400">
      <Ban className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}

// ──────────────────── Lead rating (§12) ────────────────────

const ERROR_KEY_MAP: Record<string, string> = {
  "not-purchased": "ratingErrorNotPurchased",
  "already-rated": "ratingErrorAlreadyRated",
  "invalid-quality": "ratingErrorInvalidQuality",
  "offer-not-found": "ratingErrorOfferNotFound",
  "invalid-worker": "ratingErrorInvalidWorker",
  failed: "ratingErrorFailed",
};

function LeadRatingRow({
  offerId,
  leadNumber,
  grade,
}: {
  offerId: string;
  leadNumber: string;
  grade: string;
}) {
  const { t } = useLocale();
  const [rated, setRated] = useState(false);
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rated) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Sparkles className="h-3.5 w-3.5" />
        {t("leadMarket.ratingThankYou")}
      </p>
    );
  }

  async function handleRate(quality: number) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitLeadRatingAction({ offerId, quality, converted: true });
      if (result.ok) {
        setRated(true);
      } else {
        setError(result.error ?? "failed");
      }
    } catch {
      setError("failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-500 dark:text-ink-400">
        {t("leadMarket.rateThisLead")}:
      </span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={submitting}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-lg transition-colors disabled:opacity-50"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            {(hover || 0) >= star ? "★" : "☆"}
          </button>
        ))}
      </div>
      {error && (
        <span className="text-xs text-red-500">{t(`leadMarket.${ERROR_KEY_MAP[error] ?? "ratingErrorFailed"}`)}</span>
      )}
    </div>
  );
}

