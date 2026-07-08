# Staff repository — CRUD + soft-delete + restore, audit-wired

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-08
Parent: #01
Blocked by: #2

## Goal

Deliver the Staff entity repository — create/read/update, soft-delete (void) and restore, with an active-only listing for selectors — where every mutation emits a correct field-level audit entry via the audit provider.

## Acceptance criteria

- [ ] Create a staff (name, phone, notes) → `getById` returns the full record with system timestamps; `list` includes it — proves the write+read path.
- [ ] Void a staff → `listActive` excludes it but `getById` still returns it (with `voided_at` set) — proves soft-delete hides from new-transaction selectors while preserving history (stories 3, 5).
- [ ] `search({ text })` matches active staff by name/phone substring (e.g. "张" finds "张三") and excludes voided staff — proves the active-list search (story 5 "可搜索").
- [ ] Restore a voided staff → `listActive` includes it again and `voided_at` is cleared — proves restore (story 4).
- [ ] Update phone + notes → re-read shows new values; the audit timeline has an `action='update'` entry whose diff shows exactly those fields' old→new — proves field-level audit on update (story 28).
- [ ] create / update / void / restore each produce exactly one audit entry with the correct action and `actor='owner'` — proves full CRUD audit coverage.
- [ ] A voided staff is still reachable by id for historical lookups (not erased) — proves the no-hard-delete invariant.

## Scope

- **In**: Staff entity shape (id, name, phone, notes, voided_at, created_at, updated_at); `staffRepo` create/getById/list/listActive/search/update/void/restore; audit wiring for all four actions.
- **Out**: staff's current inventory / amounts (that's derived in #07, not staff's concern); UI.

## Context

- PRD schema: `staff`: id, name, phone, notes, voided_at(nullable), created_at, updated_at.
- PRD soft-delete semantics: "员工/商品置 voided_at 后从新交易的选择器中排除；历史引用保持完整；可清除 voided_at 恢复".
- Consumes the audit provider from #02 (call `logEvent` on each mutation).
- Built on the storage port from #01.
- Sibling to #04 (product) — both depend only on audit; either may be built first.

## Design

- **Interface delta** — `staffRepo` public surface after this spec:
  ```ts
  type Staff = { id: string; name: string; phone: string; notes: string;
                 voided_at: number | null; created_at: number; updated_at: number };
  staffRepo.create(input: { name; phone; notes }): Staff;            // repo sets id + created_at=updated_at=now, voided_at=null
  staffRepo.getById(id: string): Staff | null;                       // returns even if voided (history)
  staffRepo.list(opts?: { includeVoided?: boolean }): Staff[];       // default excludes voided
  staffRepo.listActive(): Staff[];                                   // voided_at == null — for new-transaction selectors
  staffRepo.search(q: { text?: string }): Staff[];                   // substring on name/phone, voided excluded — story 5
  staffRepo.update(id, patch: { name?; phone?; notes? }): Staff;     // updated_at advances
  staffRepo.void(id): Staff;                                         // sets voided_at = now
  staffRepo.restore(id): Staff;                                      // clears voided_at
  ```
- **Internal architecture** — thin module over `StoragePort` (#01) + the audit provider (#02). Every mutating method follows one shape: read current → apply change → persist → call `audit.logEvent({action, entity_type:'staff', entity_id, before, after})`, all inside a `withTransaction` so the staff row and its audit entry commit atomically (no audit-without-change or change-without-audit on failure). The repo owns id/timestamp/voided semantics; the adapter stores rows opaquely. `create` → `before=undefined, after=staff` (diff = all fields); `update` → `before`/`after` of the patched record; `void` → `before`/`after` with `voided_at` change; `restore` → the reverse.
  - **Deep-module note**: each staff method is intentionally thin (the depth lives in the audit provider and the port). This is correct — staff is a simple master-data entity; do not invent depth here.

## Rework on failure

Failure is isolated to the staff module. If audit coupling proves wrong (e.g. a mutation shouldn't be audited), the change is localized to the relevant `staffRepo` method — audit provider and port are untouched.
