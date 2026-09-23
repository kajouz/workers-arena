/**
 * ────────────────────────────────────────────────────────────────────────────
 * DEMO STORE ADOPTION — heal a process-wide store that predates a field
 * ────────────────────────────────────────────────────────────────────────────
 * The demo data layer keeps its stores on `globalThis` on purpose: Turbopack
 * loads a module once PER ENTRY GRAPH in dev, so a plain module-level value
 * would be duplicated between a page, a server action and a route handler (a
 * deposit confirmed by the checkout route would be invisible to /bookings).
 * globalThis gives every graph the same object.
 *
 * Adoption is the price of that. A long-lived `next dev` process keeps the
 * object it created first, so a field ADDED to the store afterwards reads as
 * `undefined` in that process — no error at build time, no error at import
 * time, just a crash or a silently disabled feature on the first read:
 *
 *   • `settlements` (booking store) → `STORE.settlements.get(...)` threw, which
 *     took down every worker profile and /search render in a running dev server;
 *   • `instantBook` / `fixedPrice` (worker store) → the demo catalog had no
 *     instant-bookable service, so the Phase-2 feature looked broken in the
 *     preview while being correct in a fresh process and correct in the DB.
 *
 * `healStoreShape` closes that class of bug: a stored object is filled from the
 * CURRENT build's fresh shape, and nothing that already exists is overwritten
 * (existing data is the whole reason to adopt rather than recreate).
 *
 * Adding a field to a demo store should therefore be: add it to the fresh
 * shape, and the heal carries it into any process already running.
 */

/**
 * Fill every key of `defaults` that `store` does not have yet.
 *
 * `defaults` must be a NEW, empty shape (the same literal/function the store
 * uses for a first creation), not a populated example: only the missing keys
 * are copied, so a store's real contents survive untouched.
 *
 * Returns the same object it was given, so it reads as a one-liner at the
 * adoption site.
 */
export function healStoreShape<T extends object>(store: T, defaults: Partial<T>): T {
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (store[key] === undefined) store[key] = defaults[key]!;
  }
  return store;
}

/**
 * What this does NOT fix: a store whose ELEMENTS are stale rather than whose
 * shape is. The demo workforce (`__workersArenaDemoWorkers`) is an array of
 * worker objects built by `buildWorkforce`; an older process holds workers
 * without a field added since, and no key-heal can recover it — rebuilding the
 * array would discard every in-place demo mutation, which is worse. Element
 * staleness is fixed by restarting the dev server, and (unlike a missing key)
 * it cannot throw: the affected field simply reads as `undefined`.
 */
