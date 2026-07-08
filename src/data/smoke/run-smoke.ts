import * as SQLite from "expo-sqlite";
import { ExpoSqliteAdapter } from "@/data/expo-sqlite";
import { InMemoryAdapter } from "@/data/in-memory";
import { behaviorScript, setupRepos } from "@/data/smoke/behavior-script";
import type { SmokeStep } from "@/data/smoke/behavior-script";
import { stable } from "@/data/smoke/stable";

/**
 * The device smoke runner (spec #02/#03) — verifies `ExpoSqliteAdapter` is
 * behaviorally identical to `InMemoryAdapter` by running the shared
 * {@link behaviorScript} against both and deep-comparing each step's normalized
 * snapshot. Self-contained: opens/closes its own DB and builds its own repos; no
 * `SQLiteProvider` or composition root is introduced.
 *
 * Device-only: imports `expo-sqlite` (no Jest test imports this module). The Home
 * `__DEV__` entry calls this on press and renders the result.
 */

/** The smoke uses a dedicated DB file so production data is never touched. */
const SMOKE_DB_NAME = "shop_note_smoke.db";

export interface SmokeResult {
  /** true iff every step's Expo snapshot deep-equals its InMemory snapshot. */
  pass: boolean;
  /** One line per step (✓/✗ + name + ok/mismatch/threw). */
  details: string;
}

/**
 * Run `steps` (default: the full {@link behaviorScript}) and return per-step
 * pass/mismatch. Each step runs once against an Expo repo set and once against
 * an InMemory repo set; `stable()` normalizes volatile fields (ids, timestamps,
 * undefined) before the order-independent deep compare.
 */
export async function runExpoSqliteSmoke(
  steps: readonly SmokeStep[] = behaviorScript,
): Promise<SmokeResult> {
  // Start from a clean DB each run — leftover rows from a prior smoke would make
  // the Expo side diverge from the always-fresh InMemory side.
  await SQLite.deleteDatabaseAsync(SMOKE_DB_NAME).catch(() => {
    /* first run: no file to delete */
  });

  const storage = await ExpoSqliteAdapter.open(SMOKE_DB_NAME);
  try {
    const expo = setupRepos(storage);
    const mem = setupRepos(new InMemoryAdapter());
    const lines: string[] = [];
    let allOk = true;

    for (const step of steps) {
      let ok = false;
      let note = "ok";
      try {
        const expoSnapshot = stable(await step.run(expo));
        const memSnapshot = stable(await step.run(mem));
        ok = deepEqual(expoSnapshot, memSnapshot);
        if (!ok) {
          note =
            `MISMATCH\n      expo: ${JSON.stringify(expoSnapshot)}\n` +
            `      mem:  ${JSON.stringify(memSnapshot)}`;
        }
      } catch (error) {
        note = `THREW: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (!ok) allOk = false;
      lines.push(`${ok ? "✓" : "✗"} ${step.name} — ${note}`);
    }

    return { pass: allOk, details: lines.join("\n") };
  } finally {
    await storage.close();
  }
}

/** Order-independent deep equal (post-`stable`, no undefined/Date/function edges). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((v, i) => deepEqual(v, b[i]));
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  return ak.length === bk.length &&
    ak.every((k) => deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ));
}
