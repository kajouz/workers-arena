"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Trash2, Archive, Tag, Mail, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface BulkActionsProps<T> {
  selectedItems: T[];
  onClearSelection: () => void;
  actions: BulkAction<T>[];
  className?: string;
}

interface BulkAction<T> {
  id: string;
  label: string;
  labelAr: string;
  icon: typeof Trash2;
  variant?: "default" | "destructive" | "outline";
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  confirmationMessageAr?: string;
  onAction: (items: T[]) => Promise<void>;
}

/**
 * Bulk actions toolbar for admin operations
 */
export function BulkActions<T extends { id: string }>({
  selectedItems,
  onClearSelection,
  actions,
  className,
}: BulkActionsProps<T>) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<BulkAction<T> | null>(null);

  const handleAction = async (action: BulkAction<T>) => {
    if (action.requiresConfirmation) {
      setConfirmAction(action);
      return;
    }

    setLoading(action.id);
    try {
      await action.onAction(selectedItems);
      onClearSelection();
    } catch (error) {
      console.error(`[BulkActions] ${action.id} failed:`, error);
    } finally {
      setLoading(null);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;

    setLoading(confirmAction.id);
    try {
      await confirmAction.onAction(selectedItems);
      onClearSelection();
    } catch (error) {
      console.error(`[BulkActions] ${confirmAction.id} failed:`, error);
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  };

  if (selectedItems.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={cn(
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-ink-200 bg-white p-3 shadow-xl dark:border-ink-800 dark:bg-ink-900",
          className
        )}
      >
        <div className="flex items-center gap-4">
          {/* Selection count */}
          <div className="flex items-center gap-2">
            <Badge variant="solid">
              {selectedItems.length} {isArabic ? "محدد" : "selected"}
            </Badge>
            <button
              onClick={onClearSelection}
              className="text-ink-400 hover:text-ink-600"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-ink-200 dark:bg-ink-700" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.id}
                variant={action.variant ?? "outline"}
                size="sm"
                onClick={() => handleAction(action)}
                disabled={loading !== null}
                className="gap-1.5"
              >
                {loading === action.id ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <action.icon className="size-4" />
                )}
                {isArabic ? action.labelAr : action.label}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Confirmation dialog */}
      <AnimatePresence>
        {confirmAction && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                {isArabic ? "تأكيد الإجراء" : "Confirm Action"}
              </h3>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
                {isArabic
                  ? confirmAction.confirmationMessageAr
                  : confirmAction.confirmationMessage}
              </p>
              <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                {isArabic
                  ? `سيتم تطبيق هذا الإجراء على ${selectedItems.length} عنصر`
                  : `This action will be applied to ${selectedItems.length} items`}
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                >
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  variant={confirmAction.variant ?? "default"}
                  onClick={handleConfirm}
                  disabled={loading !== null}
                >
                  {loading === confirmAction.id ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    isArabic ? "تأكيد" : "Confirm"
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Pre-built bulk actions for common operations
 */
export const commonBulkActions = {
  delete: <T extends { id: string }>(onDelete: (items: T[]) => Promise<void>): BulkAction<T> => ({
    id: "delete",
    label: "Delete",
    labelAr: "حذف",
    icon: Trash2,
    variant: "destructive",
    requiresConfirmation: true,
    confirmationMessage: "Are you sure you want to delete these items?",
    confirmationMessageAr: "هل أنت متأكد من حذف هذه العناصر؟",
    onAction: onDelete,
  }),

  archive: <T extends { id: string }>(onArchive: (items: T[]) => Promise<void>): BulkAction<T> => ({
    id: "archive",
    label: "Archive",
    labelAr: "أرشفة",
    icon: Archive,
    onAction: onArchive,
  }),

  tag: <T extends { id: string }>(onTag: (items: T[]) => Promise<void>): BulkAction<T> => ({
    id: "tag",
    label: "Add Tag",
    labelAr: "إضافة وسم",
    icon: Tag,
    onAction: onTag,
  }),

  email: <T extends { id: string }>(onEmail: (items: T[]) => Promise<void>): BulkAction<T> => ({
    id: "email",
    label: "Send Email",
    labelAr: "إرسال بريد",
    icon: Mail,
    onAction: onEmail,
  }),
};
