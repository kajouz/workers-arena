"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  return (
    <EmptyState
      icon={Search}
      title={query ? `No results for "${query}"` : "No workers found"}
      description="Try adjusting your filters or search for a different trade or location."
    />
  );
}

/* ─── Favorites Empty ─── */
export function FavoritesEmpty() {
  return (
    <EmptyState
      icon={Heart}
      title="No favorites yet"
      description="Tap the heart icon on any worker to save them here for quick access later."
    />
  );
}

/* ─── Forum Empty ─── */
export function ForumEmpty() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No discussions yet"
      description="Be the first to ask a question or share advice with the community."
      action={{ label: "Start a discussion", onClick: () => {} }}
    />
  );
}

/* ─── Reviews Empty ─── */
export function ReviewsEmpty() {
  return (
    <EmptyState
      icon={Star}
      title="No reviews yet"
      description="Be the first to leave a review and help others find great workers."
      action={{ label: "Write a review", onClick: () => {} }}
    />
  );
}

/* ─── Bookings Empty ─── */
export function BookingsEmpty({ role = "customer" }: { role?: "customer" | "worker" }) {
  return (
    <EmptyState
      icon={Calendar}
      title={role === "worker" ? "No incoming bookings" : "No bookings yet"}
      description={
        role === "worker"
          ? "When customers book you, their requests will appear here."
          : "Find a worker and book a service to get started."
      }
      action={
        role === "customer"
          ? { label: "Find workers", onClick: () => {} }
          : undefined
      }
    />
  );
}

/* ─── Notifications Empty ─── */
export function NotificationsEmpty() {
  return (
    <EmptyState
      icon={Bell}
      title="You're all caught up!"
      description="No new notifications. We'll let you know when something needs your attention."
    />
  );
}

/* ─── Saved Items Empty ─── */
export function SavedEmpty() {
  return (
    <EmptyState
      icon={Bookmark}
      title="Nothing saved yet"
      description="Bookmark workers, articles, or search results to find them quickly later."
    />
  );
}

/* ─── Documents Empty ─── */
export function DocumentsEmpty() {
  return (
    <EmptyState
      icon={FileText}
      title="No documents uploaded"
      description="Upload certificates, licenses, or IDs to verify your profile."
      action={{ label: "Upload document", onClick: () => {} }}
    />
  );
}

/* ─── Team Empty ─── */
export function TeamEmpty() {
  return (
    <EmptyState
      icon={Users}
      title="No team members yet"
      description="Invite workers to join your company team and manage them from here."
      action={{ label: "Invite member", onClick: () => {} }}
    />
  );
}

/* ─── Error State ─── */
export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
        <AlertCircle className="size-10 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {description}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-6">
          Try again
        </Button>
      )}
    </div>
  );
}
