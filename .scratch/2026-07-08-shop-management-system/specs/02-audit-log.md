# Audit log provider — field-level diff capture + read-only timeline

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-08
Parent: #01
Blocked by: #1

## Goal

A reusable audit provider that captures field-level old→new diffs for any entity change and exposes a read-only, filterable timeline — consumed (not re-implemented) by every entity repository.

## Acceptance criteria

- [ ] `logEvent({entity_type, entity_id, action, before?, after?})` records one entry with a field-level diff: only changed fields appear, each as `{field, old, new}`; unchanged fields are skipped — proves the diff is computed, not a raw dump.
- [ ] A multi-field change (e.g. name + phone both changed) produces two diff entries preserving field order — proves multi-field diffs are complete and ordered.
- [ ] `queryTimeline({entity_type?, action?, date_range?})` filters correctly: by `entity_type`, by `action`, and by date range, returning a chronologically ordered, read-only sequence — proves the timeline is queryable.
- [ ] The audit store is immutable: there is no update/void/delete/restore API on audit entries — attempting any mutation is not possible through the public surface — proves audit is tamper-evident.
- [ ] `actor` defaults to `'owner'` (single-operator assumption) and `timestamp` is real `now` — proves the actor/time invariants.
- [ ] The provider is generic: the above pass using plain test fixtures (synthetic before/after objects), with zero dependency on staff/product/record entities — proves it is a true provider, not coupled to consumers.

## Scope

- **In**: `audit_log` table (id, actor, action, entity_type, entity_id, timestamp) + field-diff storage (sub-table or JSON column — decided in design); `logEvent` write API; `queryTimeline` read API; immutability; actor/time defaults.
- **Out**: calling audit from entity repositories (specs #3/#4/#6 wire that); the "record create is not audited" rule (that's a consumer-side coverage decision in #5/#6); UI timeline rendering; audit retention/pruning.

## Context

- PRD schema: `audit_log`: id, actor, action('create'|'update'|'void'|'restore'), entity_type, entity_id, timestamp + 字段差异 (`audit_log_field` 子表 field/old/new，或 JSON diff 列) — the sub-table-vs-JSON choice is a design decision for this spec.
- PRD audit coverage: "员工 CRUD、商品 CRUD、出入库 edit/void——字段级差异"; stories 28-31.
- PRD: "审计/系统字段取真实 now"; "单操作者：actor = owner".
- Built on the storage port from spec #01 (in-memory adapter for tests).
- This spec is a provider: later entity specs (#3 staff, #4 product, #6 stock edit/void) consume `logEvent` and verify their mutations produce correct entries.

## Design

- **Interface delta** — the provider's public surface after this spec (consumed by #03/#04/#06, never re-implemented):
  ```ts
  type AuditAction = 'create' | 'update' | 'void' | 'restore';
  type FieldDiff = { field: string; old: unknown; new: unknown };
  type AuditEntry = {
    id: string; actor: string; action: AuditAction;
    entity_type: string; entity_id: string; timestamp: number; // real now
    diff: FieldDiff[];                                          // only changed fields, in iteration order
  };
  // One write API — computes the diff, persists a single immutable entry.
  logEvent(input: { action: AuditAction; entity_type: string; entity_id: string;
                    before?: Record<string, unknown>; after?: Record<string, unknown>;
                    actor?: string }): AuditEntry;                 // actor defaults to 'owner'
  // One read API — read-only, filterable, chronological.
  queryTimeline(filter: { entity_type?: string; action?: AuditAction;
                          date_range?: { from?: number; to?: number } }): AuditEntry[];
  ```
  No update / void / delete / restore API exists on audit entries — immutability is enforced by the absence of the surface, not by runtime checks.
- **Internal architecture** — the diff computation is a generic, entity-agnostic function: iterate the union of `before`/`after` keys, emit `{field, old, new}` only where `old !== new` (deep-equality on primitives; `undefined→value` counts as a change for create, `value→undefined` for void's clear). Diff storage: a **JSON diff column** on `audit_log` (one row per event, diff serialized by the adapter, native array in-memory) — chosen over an `audit_log_field` sub-table because (a) it keeps each event a single atomic insert (no orphan diffs if a mutate-and-audit transaction rolls back), (b) no query in the system filters by individual diff field, so the sub-table's only benefit (field-level query) is unused. The provider is built on `StoragePort` (#01) and owns only diff computation + the append-only invariant; it has zero knowledge of staff/product/record shapes (proven by fixture-based tests).
  - **Deep-module note**: `logEvent` hides non-trivial diff computation behind a tiny surface — a small, justified deep module. Do not split diff-computation out into a separate public module; it is the provider's core value.

## Rework on failure

Failure is isolated — this spec owns diff computation + the timeline query. If a consumer (#03/#04/#06) needs richer diff (e.g. nested item-collection diffs for stock edit), widen `logEvent`'s input here rather than duplicating diff logic in the consumer.
