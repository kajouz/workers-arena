"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Upload,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Scale,
  FileText,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/micro-interactions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
export type DisputeStatus = "open" | "under_review" | "awaiting_response" | "resolved" | "closed";
export type DisputeCategory =
  | "quality"
  | "no_show"
  | "overcharge"
  | "damage"
  | "safety"
  | "other";

export interface Dispute {
  id: string;
  bookingNumber: string;
  category: DisputeCategory;
  title: string;
  description: string;
  status: DisputeStatus;
  filedBy: string;
  filedAt: string;
  amount?: number;
  evidence: string[];
  messages: DisputeMessage[];
  resolution?: string;
}

export interface DisputeMessage {
  id: string;
  sender: "customer" | "worker" | "admin";
  senderName: string;
  text: string;
  timestamp: string;
}

/* ─── Category Config ─── */
const CATEGORIES: { id: DisputeCategory; label: string; icon: typeof AlertTriangle; description: string }[] = [
  { id: "quality", label: "Poor Quality", icon: AlertTriangle, description: "Work was not done to acceptable standard" },
  { id: "no_show", label: "No Show", icon: Clock, description: "Worker did not arrive at scheduled time" },
  { id: "overcharge", label: "Overcharge", icon: Scale, description: "Charged more than agreed price" },
  { id: "damage", label: "Property Damage", icon: Camera, description: "Damage to property during service" },
  { id: "safety", label: "Safety Concern", icon: AlertTriangle, description: "Unsafe work practices" },
  { id: "other", label: "Other", icon: FileText, description: "Other issue not listed above" },
];

const STATUS_CONFIG: Record<DisputeStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle },
  under_review: { label: "Under Review", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", icon: Clock },
  awaiting_response: { label: "Awaiting Response", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: MessageSquare },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  closed: { label: "Closed", color: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400", icon: XCircle },
};

/* ─── Dispute Form ─── */
export function DisputeForm({
  bookingNumber,
  onSubmit,
}: {
  bookingNumber: string;
  onSubmit?: (data: { category: DisputeCategory; title: string; description: string; evidence: string[] }) => void;
}) {
  const [category, setCategory] = useState<DisputeCategory | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const handleSubmit = async () => {
    if (!category || !title.trim() || !description.trim()) {
      toast("error", "Missing fields", "Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      // Simulate API call
      await new Promise((r) => setTimeout(r, 1500));
      onSubmit?.({ category, title: title.trim(), description: description.trim(), evidence: files });
      toast("success", "Dispute filed", "Our team will review your case within 24 hours");
    } catch {
      toast("error", "Failed", "Could not file dispute. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="size-5 text-red-500" />
        </div>
        <div>
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">File a Dispute</h3>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Booking #{bookingNumber}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="space-y-4"
          >
            {/* Category Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-ink-700 dark:text-ink-300">
                What is the issue?
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                      category === cat.id
                        ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/30"
                        : "border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600"
                    )}
                  >
                    <cat.icon className={cn("mt-0.5 size-4", category === cat.id ? "text-brand-500" : "text-ink-400")} />
                    <div>
                      <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{cat.label}</p>
                      <p className="text-xs text-ink-400">{cat.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={() => category && setStep(2)} disabled={!category} className="w-full">
              Continue
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="space-y-4"
          >
            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">
                Brief title
              </label>
              <Input
                placeholder="e.g., Work quality was poor"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">
                Describe what happened
              </label>
              <Textarea
                placeholder="Please provide details about the issue, including dates, amounts, and any communication with the worker..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {/* Evidence Upload */}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">
                Evidence (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="flex items-center gap-2 rounded-xl border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-ink-700">
                  <Upload className="size-4" />
                  Upload photos
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting ? (
                  <>
                    <span className="mr-2 size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    File Dispute
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Dispute Timeline ─── */
export function DisputeTimeline({ dispute }: { dispute: Dispute }) {
  const statusCfg = STATUS_CONFIG[dispute.status];

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-900 dark:text-ink-50">
          Dispute #{dispute.id.slice(-6)}
        </h3>
        <Badge className={cn("text-xs", statusCfg.color)}>
          <statusCfg.icon className="mr-1 size-3" />
          {statusCfg.label}
        </Badge>
      </div>

      <div className="rounded-xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{dispute.title}</p>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{dispute.description}</p>
        {dispute.amount && (
          <p className="mt-2 text-sm font-semibold text-red-600">
            Disputed amount: ${dispute.amount}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {dispute.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-xl border p-3",
              msg.sender === "admin"
                ? "border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20"
                : "border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {msg.sender}
              </Badge>
              <span className="text-xs text-ink-400">{msg.senderName}</span>
              <span className="ml-auto text-xs text-ink-400">
                {new Date(msg.timestamp).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-sm text-ink-700 dark:text-ink-300">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* Resolution */}
      {dispute.resolution && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Resolution
            </span>
          </div>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{dispute.resolution}</p>
        </div>
      )}
    </div>
  );
}
