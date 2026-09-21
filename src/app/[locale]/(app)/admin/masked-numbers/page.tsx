import { AdminMaskedNumbers } from "@/components/calling/admin-masked-numbers";

/**
 * Admin page for managing masked numbers.
 * Only accessible by admins.
 */
export default function AdminMaskedNumbersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ink-50 to-ink-100 dark:from-ink-900 dark:to-ink-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminMaskedNumbers />
      </div>
    </div>
  );
}
