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
 * - a `date` key → `"<date>"` (a 'YYYY-MM-DD' derived from a timestamp, e.g.
 *   `DailyFlowRow.date`, so it varies across adapters the same way time does);
 * - any key whose value normalizes to `null`/`undefined` is **dropped** — the port
 *   treats null/undefined as "absent", so a `null` key (Expo) and a missing key
 *   (InMemory, whose JSON-clone rollback drops undefined-valued keys) compare
 *   equal (the `audit_log.diff` create-scenario hazard where `FieldDiff.old` is
 *   `undefined` on InMemory vs `null` on Expo).
 * - a `FieldDiff` `{field, old, new}` is normalized **by its sibling `field` name**:
 *   `old`/`new` carry VALUES of that field, so a `voided_at` diff's `new` is a
 *   timestamp (→ `"<time>"`) and a `staff_id` diff's `new` is an id (→ `"<id>"`),
 *   even though the key holding them is always the generic `"old"`/`"new"`. This
 *   is what stops a raw `now()` millisecond (the two adapters call it ~ms apart)
 *   from leaking through a void/restore diff's `new`.
 * - **id-tokens embedded inside string values are scrubbed** — some audit diffs
 *   serialize a snapshot that embeds ids as substrings (e.g. a stock-record
 *   `items` signature `product_id:qty:unit_price|...`); that `product_id` is
 *   adapter-minted, so the surrounding qty/price (real behavior) is preserved
 *   while the id token is replaced.
 *
 * Pure, no I/O, no `expo-sqlite` import — Jest-covered. Returns a deep clone
 * (the caller's repo data is never mutated).
 */

/** Stable placeholder for identity (`id`, `*_id`) fields. */
export const ID_PLACEHOLDER = "<id>";
/** Stable placeholder for time (`*_at`, `timestamp`) fields. */
export const TIME_PLACEHOLDER = "<time>";
/** Stable placeholder for a `date` field — a 'YYYY-MM-DD' derived from a
 *  timestamp (e.g. `DailyFlowRow.date`), varying across adapters like time. */
export const DATE_PLACEHOLDER = "<date>";

/**
 * `id()` format (see `primitives.ts`): `<Date.now() base36>-<counter base36>-<rand6>`.
 * base36 never contains `-`, so the three dash-separated runs are unambiguous. The
 * final `{6}` pins the random part and stops the match at the id's real boundary
 * (a serialized value continues with `:` / `|` / digits, none of which extend it).
 */
const ID_TOKEN = /[0-9a-z]+-[0-9a-z]+-[0-9a-z]{6}/g;

/**
 * Scrub embedded id-tokens from a string value. Needed because some audit diffs
 * serialize a snapshot that EMBEDS ids as substrings — e.g. a stock-record `items`
 * signature is `product_id:qty:unit_price|...` (`auditableRecord`), and that
 * `product_id` is adapter-minted, so two adapters diverge even when the behavior
 * (same product, same qty/price) is identical. Replacing the token (not the whole
 * value) preserves the surrounding qty/price, which ARE the behavior under test.
 */
function scrubIds(value: string): string {
  return value.replace(ID_TOKEN, ID_PLACEHOLDER);
}

/** Normalize a value tree for cross-adapter compare. Returns a deep clone. */
export function stable<T>(value: T): T {
  return normalize(value) as T;
}

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "string") return scrubIds(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // FieldDiff {field, old, new}: old/new hold VALUES of the field named by the
    // sibling `field` key — a `voided_at` diff carries timestamps in old/new, a
    // `staff_id` diff carries ids. So classify old/new by the field name, not by
    // their own key (which is always "old"/"new"); a raw timestamp leaking through
    // `new` is exactly the audit-timeline hazard. `field` as a string key is
    // unique to FieldDiff in this domain, so the shape check is reliable.
    if (typeof obj.field === "string" && ("old" in obj || "new" in obj)) {
      return normalizeFieldDiff(obj);
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
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

/** Normalize a FieldDiff: `field` keeps its name; `old`/`new` are classified by it. */
function normalizeFieldDiff(diff: Record<string, unknown>): Record<string, unknown> {
  const field = diff.field as string;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(diff)) {
    const normalized =
      key === "old" || key === "new" ? normalizeByFieldName(field, v) : normalizeField(key, v);
    if (normalized === null) continue;
    out[key] = normalized;
  }
  return out;
}

/** Classify a value by a domain field name (used for FieldDiff old/new). */
function normalizeByFieldName(field: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (field === "id" || field.endsWith("_id")) return ID_PLACEHOLDER;
  if (field.endsWith("_at") || field === "timestamp") return TIME_PLACEHOLDER;
  return normalize(value);
}

function normalizeField(key: string, value: unknown): unknown {
  if (key === "id" || key.endsWith("_id")) {
    return value == null ? null : ID_PLACEHOLDER;
  }
  if (key.endsWith("_at") || key === "timestamp") {
    return value == null ? null : TIME_PLACEHOLDER;
  }
  if (key === "date") {
    return value == null ? null : DATE_PLACEHOLDER;
  }
  return normalize(value);
}
