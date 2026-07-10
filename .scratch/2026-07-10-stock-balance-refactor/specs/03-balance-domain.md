# 余额域: 充值 + 会员余额 + 记账 tab + staff-detail 余额重接

Type: spec
Status: ready-for-human
Parent: #01 (01-stock-balance-refactor.md)
Blocked by: #02

## Goal

会员从「库存持有者」变为「充值 + 出库」双动作——新增 `TopupRepository`（充值流水）、`MemberBalance`（派生余额 = Σ充值 − Σ出库 line_amount，从不存储、可为负=欠款）；记账 tab 填入「[充值][出库] + 余额 ¥X」；staff-detail 填入余额分区 + 充值历史（含作废入口）。

## Acceptance criteria

- [ ] 给会员充值 ¥100 → `MemberBalance.balance(staff_id).amount===cents(100)`；再记一笔出库 line_amount=¥30 → `amount===cents(70)`。——US3, US5
- [ ] 出库金额 > 余额时 `amount` 为负（欠款），不拦截不报错；记账行显示「欠款」badge + danger 色。——US10 余额侧
- [ ] 会员详情历史中点充值条作废 → 确认 → `useVoidTopup` 提交 → `MemberBalance.balance()` 重算排除该笔（余额回落）；作废一笔出库 → 余额回升。——US11 critical path 闭环（operator-action → 余额刷新）
- [ ] 记账行显示「余额 ¥70.00」替代占位骨架；充值/出库后余额自动刷新（mutation invalidate `qk.balance`）。
- [ ] staff-detail 余额分区显示余额 + 欠款标注；历史含出库+充值两类事件按天分组、可展开。

## Scope

- **In**:
  - 数据层：TopupRepository（create 审计 / void 软删+审计 / list 排除 voided / getById 含 voided）、MemberBalance（派生 balance）、composition 接入 topups + memberBalance。
  - 流层：query-keys 加 `qk.topups`/`qk.balance`；reads 加 `useTopups`/`useMemberBalance`；mutations 加 `useCreateTopup`/`useVoidTopup`，且出库 create/void 的 onSuccess 加 invalidate `qk.balance`（余额随出库自动刷新）。
  - UI：bookkeeping 填 `useMemberBalance`；staff-row 填余额展示 + 欠款 badge + [充值]按钮；新增充值表单（仅金额 + 备注）；staff-detail 填余额分区 + 综合历史 + 充值作废入口（确认 → useVoidTopup）。
- **Out**: 单价/拆分（spec 04）；综合流水 UI（spec 05，但本 spec 的 topup 数据层是 spec 05 的依赖）；出库快照单价（spec 04）。

## Context

- ADR-0002（派生不存储——MemberBalance 派生）、ADR-0005（数据流 invalidation）、ADR-0006（测试 seam）。
- CONTEXT invariant #4（派生不存储）、#5（欠款允许负余额）。
- 现有范式：StaffRepository/ProductRepository 的 create/void 审计 mutate 模板（staff.ts/product.ts）；mutations.ts 的 gate + family-root invalidation。
- topup 表 schema 由 spec 01 落地；记账 tab 的占位骨架由 spec 02 产出（移除了 useStaffSummaries）。

## Design

- **Interface delta**
  - `TopupRepository`：`create({staff_id, amount, note?})` 审计 / `void(id)` 软删+审计 / `list({staff_id?})`（排除 voided）/ `getById`（含 voided）。`amount` 为 `Cents`，无商品、无条目。
  - `MemberBalance`：`balance(staff_id) → { amount: Cents }`（派生 `Σ未作废 topup − Σ该会员未作废 out 记录 line_amount`）。
  - `composition`：接入 `topups: TopupRepository` + `memberBalance: MemberBalance`（依赖 `topups` + `stockRecords`）。
  - `query-keys`：`qk.topups`（all/list/byId）+ `qk.balance`（all/byStaff）。
  - `reads`：`useTopups(filter)` + `useMemberBalance(staffId)`。
  - `mutations`：`useCreateTopup`/`useVoidTopup`（gate + 审计 + invalidate `qk.topups`+`qk.balance`；`qk.dailyFlow` 的 invalidate 留 spec 05——dailyFlow 此时才含充值事件，提前 invalidate 是空操作）；`useCreateStockRecord`/`useUpdateStockRecord`/`useVoidStockRecord` 的 onSuccess 加 invalidate `qk.balance`（出库 create/edit/void 都改 line_amount → 影响余额，必须刷新）。
  - UI：`bookkeeping` 填 `useMemberBalance`；`staff-row` 余额展示 + 欠款 badge + [充值]；新增充值表单（仅金额+备注）；`staff-detail` 余额分区 + 综合历史（出库+充值按天）+ 充值作废入口（确认 → useVoidTopup）。

- **Internal architecture**
  - **MemberBalance 纯派生读**（同 `shopAggregate` 范式）：从不存储（invariant #4），每次读重算；负值=欠款（invariant #5 扩展）。
  - **TopupRepository 同构** StaffRepo/ProductRepo 的审计 mutate 模板（create/void 在事务内 + audit）。
  - **余额自动刷新**：出库 create/**update**/void 都 invalidate `qk.balance`（编辑改 items → line_amount 变 → 余额变），记账行/详情余额自动重算（ADR-0005 family-root invalidation）。
  - 充值作废入口在 staff-detail 历史（operator-action 闭环 US11）。

- **Deep-module note**：`MemberBalance` 作为独立派生类（单一职责：会员金钱余额），与 `Inventory`（库存）分离——两个 deep 模块而非一个混合的"库存+余额"上帝对象。

## Rework on failure

余额域自包含——失败 redo 本 spec（topup/memberBalance + 记账/staff-detail 余额重接）；不波及库存/单价域。

## Comments

- 2026-07-11 — implemented via `/tdd`（数据层 → 流层 → UI，全量双绿）。AC → 测试：
  - 充值 ¥100 → balance cents(10000)；out ¥30 → cents(7000) — `src/data/member-balance.test.ts::balance = Σ topup − Σ out line_amount`
  - out > 余额 → 负（欠款），不拦截；记账行「欠款 ¥X」danger 色 — `::out exceeding top-up → negative balance`；`src/components/staff-row.test.tsx::shows a 欠款 marker when the balance is negative`
  - 作废充值 → 余额回落；作废出库 → 余额回升（operator-action 闭环）— `member-balance.test.ts::voiding a top-up` / `::voiding an 'out' record`；UI 闭环 `staff-detail.test.tsx::lists top-ups ... voiding one recovers the balance`
  - 记账行显示「余额 ¥X」替代占位；充值/出库后自动刷新（invalidate qk.balance）— `staff-row.test.tsx::renders the member's derived 余额` / `::充值 form: amount + submit → balance increases`
  - staff-detail 余额分区 + 综合（出库+充值）历史按天、可展开 — `staff-detail.test.tsx::shows the derived 余额 + 充值/出库 summary` / day-collapse / history / day-batched（既有用例随新结构同步）
  - `tsc --noEmit` 通过；`jest` 全绿 235 passed（30 suites）
- 数据层：`topup.ts` TopupRepository（create/void 审计 + list 排除 voided + getById 含 voided，仿 product 模板）；`member-balance.ts` MemberBalance（派生 `Σ topup − Σ out line_amount`，负=欠款，从不存储）；`composition.ts` 接入 `topups` + `memberBalance`。
- 流层：`query-keys` 加 `qk.topups`/`qk.balance`；`reads` 加 `useTopups`/`useMemberBalance`；`mutations` 加 `useCreateTopup`/`useVoidTopup`（invalidate topups+balance；dailyFlow invalidate 留 spec 05）；`useCreateStockRecord`/`useUpdateStockRecord`/`useVoidStockRecord` 加 invalidate `qk.balance`。
- UI：`staff-row.tsx` 填 `useMemberBalance` + 内联充值表单（元→Cents）+ `negativeLabel='欠款'`；`staff-detail.tsx` 加余额分区 + 综合历史（合并出库+充值按天）+ 充值作废入口（确认 → useVoidTopup）；`money-text.tsx` 加 `negativeLabel` prop（默认「欠货」，余额用「欠款」）。
- 与库存解耦：restock（admin -1 in）不影响会员余额（`member-balance.test.ts::restock under admin -1 does NOT affect ...`）。
- **[手动/发布门]** 真实 SQLite 下 topup 表 + 余额派生的运行时行为仅设备 smoke 覆盖（ADR-0004，发布前手跑）。
- Codemap / CONTEXT.md 术语更新延后到 `/sdd-flow` Stage 4。

