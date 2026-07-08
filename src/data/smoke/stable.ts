/**
 * Normalizer for the cross-adapter device smoke (spec #02/#03).
 *
 * The smoke runs the same `behaviorScript` against two repo sets — one backed by
 * `ExpoSqliteAdapter`, one by `InMemoryAdapter` — and deep-compares each step's
 * result. Both adapters call the same module-level `id()` / `now()`, but those
 * produce *different* values as the two repo sets are built independently, so
 * raw deep-equal would always diverge on identity and time. `stable()` collapses
 * the volatile fields to stable placeholders so the comparison reflects
 * *behavior*, not mint marks:
 *
 * - `id` and any `*_id` → `"<id>"`;
 * - any `*_at` and `timestamp` → `"<time>"` when present, `null` when absent
 *   (`voided_at: null` means "not voided" and must stay null);
 * - any key whose value normalizes to `null`/`undefined` is **dropped** — the port
 *   treats null/undefined as "absent", so a `null` key (Expo) and a missing key
 *   (InMemory, whose JSON-clone rollback drops undefined-valued keys) compare
 *   equal (the `audit_log.diff` create-scenario hazard where `FieldDiff.old` is
 *   `undefined` on InMemory vs `null` on Expo).
 *
 * Pure, no I/O, no `expo-sqlite` import — Jest-covered. Returns a deep clone
 * (the caller's repo data is never mutated).
 */

/** Stable placeholder for identity (`id`, `*_id`) fields. */
export const ID_PLACEHOLDER = "<id>";
/** Stable placeholder for time (`*_at`, `timestamp`) fields. */
export const TIME_PLACEHOLDER = "<time>";

/** Normalize a value tree for cross-adapter compare. Returns a deep clone. */
export function stable<T>(value: T): T {
  return normalize(value) as T;
}

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeField(key, v);
      // The port treats null/undefined as "absent" (`Query`: "null/undefined both
      // mean absent"; `InMemoryAdapter.matches`: null/undefined both count as
      // absent). Canonicalize the same way here — DROP null-valued keys — so a key
      // that is `null` on one side and MISSING on the other compare equal. That gap
      // is real: `InMemoryAdapter`'s rollback deep-clones rows via
      // `JSON.parse(JSON.stringify(...))`, which drops undefined-valued keys (e.g. a
      // create-audit `FieldDiff.old === undefined`), while `expo-sqlite`'s ROLLBACK
      // leaves the committed row's stored `null` intact. Both are observably
      // "absent" per the port contract, so they must compare equal.
      if (normalized === null) continue;
      out[key] = normalized;
    }
    return out;
  }
  return value;
}

function normalizeField(key: string, value: unknown): unknown {
  if (key === "id" || key.endsWith("_id")) {
    return value == null ? null : ID_PLACEHOLDER;
  }
  if (key.endsWith("_at") || key === "timestamp") {
    return value == null ? null : TIME_PLACEHOLDER;
  }
  return normalize(value);
}
