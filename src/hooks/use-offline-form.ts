"use client";

import { useState, useEffect, useCallback } from "react";
import {
  queueFormSubmission,
  getPendingCount,
  processQueuedForms,
  isOnline,
} from "@/lib/offline-forms";

interface UseOfflineFormOptions {
  url: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  onQueued?: (id: string) => void;
}

interface UseOfflineFormReturn {
  submit: (body: any) => Promise<void>;
  isSubmitting: boolean;
  isOnline: boolean;
  pendingCount: number;
  error: Error | null;
}

/**
 * React hook for handling offline form submissions
 */
export function useOfflineForm({
  url,
  method = "POST",
  onSuccess,
  onError,
  onQueued,
}: UseOfflineFormOptions): UseOfflineFormReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Track online status
  useEffect(() => {
    setOnline(isOnline());

    const handleOnline = () => {
      setOnline(true);
      // Auto-process queue when coming back online
      processQueuedForms().then((result) => {
        if (result.success > 0) {
          console.log(`[OfflineForms] Auto-processed ${result.success} submissions`);
        }
        updatePendingCount();
      });
    };

    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Update pending count periodically
  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const updatePendingCount = async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error("[OfflineForms] Failed to get pending count:", err);
    }
  };

  const submit = useCallback(
    async (body: any) => {
      setIsSubmitting(true);
      setError(null);

      try {
        if (isOnline()) {
          // Try to submit directly
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          onSuccess?.(data);
        } else {
          // Queue for later
          const id = await queueFormSubmission(url, method, body);
          onQueued?.(id);
          await updatePendingCount();
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);

        // If online submission failed, try queueing
        if (isOnline()) {
          try {
            const id = await queueFormSubmission(url, method, body);
            onQueued?.(id);
            await updatePendingCount();
            setError(null); // Clear error since we queued it
          } catch (queueErr) {
            console.error("[OfflineForms] Failed to queue:", queueErr);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [url, method, onSuccess, onError, onQueued]
  );

  return {
    submit,
    isSubmitting,
    isOnline: online,
    pendingCount,
    error,
  };
}

/**
 * Hook for managing offline queue status
 */
export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(isOnline());
    updatePendingCount();

    const handleOnline = () => {
      setOnline(true);
      processQueue();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(updatePendingCount, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const updatePendingCount = async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error("[OfflineForms] Failed to get pending count:", err);
    }
  };

  const processQueue = async () => {
    setIsProcessing(true);
    try {
      const result = await processQueuedForms();
      await updatePendingCount();
      return result;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    pendingCount,
    isProcessing,
    isOnline: online,
    processQueue,
    refresh: updatePendingCount,
  };
}
