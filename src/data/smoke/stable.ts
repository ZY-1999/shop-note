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
 * - `undefined` → `null` (the `audit_log.diff` create-scenario hazard: on
 *   InMemory `FieldDiff.old` is `undefined`, on Expo it round-trips through JSON
 *   as `null` — collapsing both to `null` makes them equal).
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
      out[key] = normalizeField(key, v);
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
