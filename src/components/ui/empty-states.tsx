"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import {
  Search,
  Heart,
  MessageSquare,
  Star,
  Calendar,
  FileText,
  Users,
  Bell,
  Bookmark,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

/* ─── Base Empty State ─── */
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
    >
      <div className="relative mb-6">
        <div className="flex size-20 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950/30">
          <Icon className="size-10 text-brand-400 dark:text-brand-500" />
        </div>
        {/* Decorative ring */}
        <div className="absolute inset-0 -m-2 rounded-full border-2 border-dashed border-brand-200/50 dark:border-brand-800/30" />
      </div>
      <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/* ─── Search Empty ─── */
export function SearchEmpty({ query }: { query?: string }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Search}
      title={query
        ? isAr
          ? `لا توجد نتائج لـ «${query}»`
          : `No results for "${query}"`
        : isAr
          ? "لم يتم العثور على عمال"
          : "No workers found"}
      description={
        isAr
          ? "جرّب تعديل الفلاتر أو البحث عن مهنة أو موقع مختلف."
          : "Try adjusting your filters or search for a different trade or location."
      }
    />
  );
}

/* ─── Favorites Empty ─── */
export function FavoritesEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Heart}
      title={isAr ? "لا توجد مفضلة بعد" : "No favorites yet"}
      description={
        isAr
          ? "اضغط على أيقونة القلب على أي عامل لحفظه هنا للوصول السريع لاحقاً."
          : "Tap the heart icon on any worker to save them here for quick access later."
      }
    />
  );
}

/* ─── Forum Empty ─── */
export function ForumEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={MessageSquare}
      title={isAr ? "لا توجد مناقشات بعد" : "No discussions yet"}
      description={
        isAr
          ? "كن أول من يطرح سؤالاً أو يشارك نصيحة مع المجتمع."
          : "Be the first to ask a question or share advice with the community."
      }
      action={{ label: isAr ? "ابدأ مناقشة" : "Start a discussion", onClick: () => {} }}
    />
  );
}

/* ─── Reviews Empty ─── */
export function ReviewsEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Star}
      title={isAr ? "لا توجد تقييمات بعد" : "No reviews yet"}
      description={
        isAr
          ? "كن أول من يكتب تقييماً ويساعد الآخرين في العثور على عمال ممتازين."
          : "Be the first to leave a review and help others find great workers."
      }
      action={{ label: isAr ? "اكتب تقييماً" : "Write a review", onClick: () => {} }}
    />
  );
}

/* ─── Bookings Empty ─── */
export function BookingsEmpty({ role = "customer" }: { role?: "customer" | "worker" }) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Calendar}
      title={
        role === "worker"
          ? isAr
            ? "لا توجد حجوزات واردة"
            : "No incoming bookings"
          : isAr
            ? "لا توجد حجوزات بعد"
            : "No bookings yet"
      }
      description={
        role === "worker"
          ? isAr
            ? "ستظهر طلبات الحجز من العملاء هنا."
            : "When customers book you, their requests will appear here."
          : isAr
            ? "ابحث عن عامل واحجز خدمة للبدء."
            : "Find a worker and book a service to get started."
      }
      action={
        role === "customer"
          ? { label: isAr ? "ابحث عن عمال" : "Find workers", onClick: () => {} }
          : undefined
      }
    />
  );
}

/* ─── Notifications Empty ─── */
export function NotificationsEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Bell}
      title={isAr ? "أنت محدّث بالكامل!" : "You're all caught up!"}
      description={
        isAr
          ? "لا توجد إشعارات جديدة. سنخطرك عندما يحتاج شيء إلى اهتمامك."
          : "No new notifications. We'll let you know when something needs your attention."
      }
    />
  );
}

/* ─── Saved Items Empty ─── */
export function SavedEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Bookmark}
      title={isAr ? "لا شيء محفوظ بعد" : "Nothing saved yet"}
      description={
        isAr
          ? "احفظ العمال أو المقالات أو نتائج البحث للوصول إليها بسرعة لاحقاً."
          : "Bookmark workers, articles, or search results to find them quickly later."
      }
    />
  );
}

/* ─── Documents Empty ─── */
export function DocumentsEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={FileText}
      title={isAr ? "لا توجد مستندات مرفوعة" : "No documents uploaded"}
      description={
        isAr
          ? "ارفع الشهادات أو الرخص أو الهوية للتحقق من ملفك."
          : "Upload certificates, licenses, or IDs to verify your profile."
      }
      action={{ label: isAr ? "رفع مستند" : "Upload document", onClick: () => {} }}
    />
  );
}

/* ─── Team Empty ─── */
export function TeamEmpty() {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  return (
    <EmptyState
      icon={Users}
      title={isAr ? "لا يوجد أعضاء فريق بعد" : "No team members yet"}
      description={
        isAr
          ? "ادعُ العمال للانضمام إلى فريق شركتك وأدرهم من هنا."
          : "Invite workers to join your company team and manage them from here."
      }
      action={{ label: isAr ? "دعوة عضو" : "Invite member", onClick: () => {} }}
    />
  );
}

/* ─── Error State ─── */
export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const defaultTitle = isAr ? "حدث خطأ ما" : "Something went wrong";
  const defaultDesc = isAr
    ? "حدث خطأ غير متوقع. حاول مرة أخرى."
    : "An unexpected error occurred. Please try again.";
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
        <AlertCircle className="size-10 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
        {title ?? defaultTitle}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {description ?? defaultDesc}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-6">
          {isAr ? "حاول مرة أخرى" : "Try again"}
        </Button>
      )}
    </div>
  );
}
