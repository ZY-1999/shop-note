/**
 * RNTL v14 + React 19 + React Query v5 async helpers (ADR-0006) — proven in
 * spec #06's form suite ([record-form.test.tsx](../components/record-form.test.tsx))
 * and reused by every later interaction suite (#07–#09).
 *
 * RNTL's `findBy*` / `waitFor` wrap every poll in `act`. In a multi-interaction
 * suite that (a) overlaps the next `fireEvent`'s act → React drops the state
 * update (submit then reads a stale line), and (b) leaks polling timers that
 * compound across tests until the renderer produces empty trees / `queries: []`.
 * These two helpers avoid act entirely — use them INSTEAD OF `findBy*` / `waitFor`.
 */

/** Yield one macrotask so pending React state / React Query notifications settle. */
export function flushPending(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Poll `get` (a sync RNTL query like `() => view.getByTestId(…)`, or an async
 * assertion) until it stops throwing, yielding one macrotask between tries —
 * WITHOUT wrapping each try in act (see file header for why that matters).
 *
 * `get` runs unguarded: query results flush on their own setTimeout between
 * yields (the cosmetic "not wrapped in act" note from jest-setup.js applies and
 * is harmless), so a plain poll observes them with no act contention and no
 * leaked timers. Bounded so a genuinely missing element / unsatisfied
 * assertion still fails fast.
 */
export async function waitForSync<T>(get: () => T | Promise<T>, timeoutMs = 2000): Promise<Awaited<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await get() as Awaited<T>;
    } catch {
      if (Date.now() >= deadline) return await get() as Awaited<T>; // final try — surface its error
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}
