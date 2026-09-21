"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ONE INTERRUPTION AT A TIME
 * ────────────────────────────────────────────────────────────────────────────
 * Four overlays competed for the bottom of the screen, each deciding for
 * itself whether to appear and none aware of the others:
 *
 *   InstallBanner   fixed bottom-0 / bottom-6 right-6, after a 2s timer
 *   UpdateBanner    fixed bottom-6 right-6              ← same spot
 *   RetargetingAd   fixed bottom-[9rem] / bottom-8 right-6, after a 2s timer
 *   MobileBannerAd  fixed bottom-[4rem]
 *
 * The offsets were hand-tuned to dodge each other, which works right up until
 * two of them are eligible at once — and two of them share a 2-second timer,
 * so a first-time visitor on an installable browser could meet an install
 * prompt and a retargeting ad arriving together on top of an ad strip.
 *
 * This grants ONE slot. Prompts declare that they want it; the highest-
 * priority claimant gets it and everyone else renders nothing. Each prompt
 * keeps its own rules about whether it is eligible at all (dismissal windows,
 * cooldowns, platform checks) — the queue only decides who goes first when
 * more than one says yes.
 *
 * Priority is an editorial judgement, not a mechanism:
 *   update  — the reader is running stale code; that is a correctness problem
 *   install — a useful offer the reader can act on
 *   ad      — commercial, and the only one that can wait
 * ────────────────────────────────────────────────────────────────────────────
 */

export type PromptId = "update" | "install" | "retargeting" | "mobile-ad";

/** Lower number wins. */
const PRIORITY: Record<PromptId, number> = {
  update: 0,
  install: 1,
  retargeting: 2,
  "mobile-ad": 3,
};

interface PromptQueueValue {
  /** Ids currently asking for the slot. */
  claimants: ReadonlySet<PromptId>;
  claim: (id: PromptId) => void;
  release: (id: PromptId) => void;
}

const PromptQueueContext = createContext<PromptQueueValue | null>(null);

export function PromptQueueProvider({ children }: { children: React.ReactNode }) {
  const [claimants, setClaimants] = useState<ReadonlySet<PromptId>>(() => new Set());

  const claim = useCallback((id: PromptId) => {
    setClaimants((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const release = useCallback((id: PromptId) => {
    setClaimants((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ claimants, claim, release }), [claimants, claim, release]);
  return <PromptQueueContext.Provider value={value}>{children}</PromptQueueContext.Provider>;
}

/**
 * Ask for the prompt slot.
 *
 * @param id     which prompt this is — decides its place in the order
 * @param wants  this prompt's own answer to "am I eligible right now?"
 * @returns      whether it may actually render
 *
 * Returns false outside the provider, so a prompt rendered somewhere
 * unexpected stays quiet rather than fighting for the corner.
 */
export function usePromptSlot(id: PromptId, wants: boolean): boolean {
  const ctx = useContext(PromptQueueContext);
  const claim = ctx?.claim;
  const release = ctx?.release;

  useEffect(() => {
    if (!claim || !release) return;
    if (wants) claim(id);
    else release(id);
    return () => release(id);
  }, [id, wants, claim, release]);

  if (!ctx || !wants) return false;

  let winner: PromptId | null = null;
  for (const candidate of ctx.claimants) {
    if (winner === null || PRIORITY[candidate] < PRIORITY[winner]) winner = candidate;
  }
  return winner === id;
}
