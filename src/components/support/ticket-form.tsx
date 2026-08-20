"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/micro-interactions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
export type TicketCategory =
  | "general"
  | "booking"
  | "payment"
  | "account"
  | "technical"
  | "other";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

export interface TicketMessage {
  id: string;
  sender: "user" | "support";
  senderName: string;
  text: string;
  timestamp: string;
}

/* ─── Category Config ─── */
const CATEGORIES: { id: TicketCategory; label: string; icon: typeof HelpCircle }[] = [
  { id: "general", label: "General Question", icon: HelpCircle },
  { id: "booking", label: "Booking Issue", icon: Clock },
  { id: "payment", label: "Payment Problem", icon: AlertCircle },
  { id: "account", label: "Account Issue", icon: MessageSquare },
  { id: "technical", label: "Technical Problem", icon: AlertCircle },
  { id: "other", label: "Other", icon: HelpCircle },
];

const PRIORITIES: { id: TicketPriority; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400" },
  { id: "medium", label: "Medium", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  { id: "high", label: "High", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { id: "urgent", label: "Urgent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
];

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", color: "bg-sky-100 text-sky-700", icon: MessageSquare },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: Clock },
  waiting: { label: "Waiting", color: "bg-purple-100 text-purple-700", icon: Clock },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  closed: { label: "Closed", color: "bg-ink-100 text-ink-600", icon: CheckCircle2 },
};

/* ─── Ticket Form ─── */
export function TicketForm({
  onSubmit,
}: {
  onSubmit?: (data: {
    subject: string;
    category: TicketCategory;
    priority: TicketPriority;
    description: string;
  }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !category || !description.trim()) {
      toast("error", "Missing fields", "Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      onSubmit?.({ subject: subject.trim(), category, priority, description: description.trim() });
      setSubmitted(true);
      toast("success", "Ticket submitted", "Our support team will respond within 24 hours");
    } catch {
      toast("error", "Failed", "Could not submit ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <FadeIn>
        <div className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
          <CheckCircle2 className="mb-4 size-12 text-emerald-500" />
          <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            Ticket Submitted!
          </h3>
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-500">
            We&apos;ve received your support request. Our team will respond within 24 hours.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setSubmitted(false);
              setSubject("");
              setCategory(null);
              setDescription("");
            }}
          >
            Submit Another Ticket
          </Button>
        </div>
      </FadeIn>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
          <MessageSquare className="size-5 text-brand-500" />
        </div>
        <div>
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Contact Support</h3>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            We typically respond within 24 hours
          </p>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">
          Subject *
        </label>
        <Input
          placeholder="Brief description of your issue"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={100}
        />
      </div>

      {/* Category */}
      <div>
        <label className="mb-2 block text-sm font-medium text-ink-700 dark:text-ink-300">
          Category *
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-medium transition-all",
                category === cat.id
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300"
                  : "border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300"
              )}
            >
              <cat.icon className="size-4" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="mb-2 block text-sm font-medium text-ink-700 dark:text-ink-300">
          Priority
        </label>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPriority(p.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                priority === p.id
                  ? p.color + " ring-2 ring-offset-1 ring-current"
                  : "bg-ink-100 text-ink-500 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-400"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">
          Description *
        </label>
        <Textarea
          placeholder="Please describe your issue in detail. Include any error messages, booking numbers, or steps to reproduce the problem."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting || !subject.trim() || !category || !description.trim()}
        className="w-full"
      >
        {submitting ? (
          <>
            <span className="mr-2 size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="mr-2 size-4" />
            Submit Ticket
          </>
        )}
      </Button>
    </div>
  );
}

/* ─── Ticket List ─── */
export function TicketList({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300 py-12 text-center dark:border-ink-700">
        <MessageSquare className="mb-3 size-10 text-ink-300 dark:text-ink-600" />
        <p className="text-sm font-medium text-ink-500">No support tickets yet</p>
        <p className="mt-1 text-xs text-ink-400">Submit a ticket and it will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const statusCfg = STATUS_CONFIG[ticket.status];
        const categoryInfo = CATEGORIES.find((c) => c.id === ticket.category);
        const priorityInfo = PRIORITIES.find((p) => p.id === ticket.priority);

        return (
          <div
            key={ticket.id}
            className="rounded-xl border border-ink-100 bg-white p-4 transition-colors hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:hover:bg-ink-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">
                    {ticket.subject}
                  </h4>
                  <Badge className={cn("text-[10px]", statusCfg.color)}>
                    <statusCfg.icon className="mr-1 size-2.5" />
                    {statusCfg.label}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-ink-400">
                  <span>#{ticket.id.slice(-6)}</span>
                  <span>{categoryInfo?.label}</span>
                  <span className={priorityInfo?.color}>{priorityInfo?.label}</span>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <span className="text-xs text-ink-400">
                {ticket.messages.length} message{ticket.messages.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
