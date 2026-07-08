import * as SQLite from "expo-sqlite";
import { ExpoSqliteAdapter } from "@/data/expo-sqlite";
import { InMemoryAdapter } from "@/data/in-memory";
import { behaviorScript } from "@/data/smoke/behavior-script";
import type { SmokeStep } from "@/data/smoke/behavior-script";
import { setupRepos } from "@/data/composition";
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
        const diff = firstDiff(expoSnapshot, memSnapshot, "<root>");
        if (diff === null) {
          ok = true;
        } else {
          note = diff; // first diverging field, e.g. "<root>.items[1].unit_price: 2495 ≠ 1995"
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

/** Compact value label for a mismatch hint. */
function describeVal(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(len ${v.length})`;
  if (typeof v === "object") return "object";
  return JSON.stringify(v);
}

/**
 * First diverging path between two post-`stable` snapshots, or `null` if equal.
 * Order-independent for object keys, order-sensitive for arrays (a real array
 * reordering between adapters IS a behavioral difference worth surfacing).
 * Returns a human path like `<root>.items[1].unit_price: 2495 ≠ 1995`.
 */
function firstDiff(a: unknown, b: unknown, path: string): string | null {
  if (a === b) return null;
  const aObj = a !== null && typeof a === "object";
  const bObj = b !== null && typeof b === "object";
  if (!aObj || !bObj) {
    return `${path}: ${describeVal(a)} ≠ ${describeVal(b)}`;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr) return `${path}: array ≠ non-array`;
    if (a.length !== b.length) return `${path}: array length ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return `${path}: ${ak.length} keys ≠ ${bk.length} keys`;
  for (const k of ak) {
    const d = firstDiff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      path ? `${path}.${k}` : k,
    );
    if (d) return d;
  }
  return null;
}
