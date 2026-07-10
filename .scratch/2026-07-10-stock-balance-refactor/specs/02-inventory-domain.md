# 库存域: 全局库存 + 管理员 -1 + 废弃 per-staff + 补货 + smoke 迁移

Type: spec
Status: ready-for-human
Parent: #01 (01-stock-balance-refactor.md)
Blocked by: #01

## Goal

库存收敛为全局唯一（`shopAggregate`，`in` 只来自 `-1` 补货）；虚拟管理员 `-1` 在数据层成为受保护实体；废弃所有 per-staff 库存派生 + 连带 hooks/query-keys；管理 tab 新增补货段；smoke 迁移到新口径——为余额域/单价域建立干净基线。

## Acceptance criteria

- [ ] `StaffRepository.list()`/`listActive()`/`search({})`/`list({includeVoided:true})` 返回列表均不含 `-1`；`staff.void('-1')` 抛错；`-1` 行始终存在。——US12 数据层基础
- [ ] `stockRecords.create({direction:'in', staff_id:<普通会员>})` 抛错；`{direction:'in', staff_id:'-1'}` 成功；`{direction:'out', staff_id:<普通会员>}` 不受约束。——证明 in 仅管理员
- [ ] 管理 tab 补货段选商品 A ×10 → 提交 → `shopAggregate` 中 A `total_qty===10`；再记一笔出库 A ×3 → `total_qty===7`。——US1, US6 数据层
- [ ] smoke `behavior-script.ts` 全部步骤改造为 `shopAggregate` + `-1` 补货口径；InMemory 半边通过；不再调 `inventory.balance`/`staffInventory`。——证明 smoke 不崩
- [ ] `npx tsc --noEmit` 通过——全项目无对已删方法/hooks/类型的引用（bookkeeping/staff-detail/staff-row 占位骨架编译干净）。——证明废弃干净
- [ ] 出库数量 > 现有全局库存 → `shopAggregate` 该商品 `total_qty` 为负（欠货），create 不抛错不拦截。——US10 欠货侧（invariant #5，与 spec 03 欠款侧对称）
- [ ] `npx jest` 全绿——所有创建 `direction='in'` 的存量测试迁移到 `staff_id='-1'`（或改 out），无运行时方向校验抛错；废弃方法的测试断言全部迁移。——证明 direction 校验不破坏存量测试套件（tsc 抓不到此运行时破坏）

## Scope

- **In**:
  - 数据层：StaffRepo 默认排除 `-1` + void 守卫；StockRecordRepo.create 校验 in↔`-1`；Inventory 删 `balance`/`staffInventory`/`staffSummaries` + `StaffSummary`/`Balance` 类型，保留 `shopAggregate`。
  - 流层：query-keys 移除 `inventory.staffSummaries`/`staff`/`balance`；reads 移除对应 hooks。
  - UI：manage-tab 加「补货」段（补货入库表单，走 useCreateStockRecord，staff_id='-1'）；bookkeeping/staff-row/staff-detail 移除 per-staff 库存依赖（占位骨架——余额留给 spec 03）；staff-row 移除「入库」按钮。
  - smoke + 测试：`behavior-script.ts` 改造 + `behavior-script.test.ts`（InMemory 半边，调 inventory.balance + dailyFlow 金额断言，随 smoke 迁移更新）；存量测试迁移——`inventory.test.ts`（删 balance/staffInventory/staffSummaries 断言）、`reads.test.tsx`（删 useBalance/useStaffInventory）、`stock-record.test.ts`/`daily-flow.test.ts`/`summary-tab.test.tsx`/`__tests__/bookkeeping-tab.test.tsx`/`staff-detail.test.tsx`/`record-form.test.tsx`（所有 `direction='in'` 改 `staff_id='-1'` 或改 out；移除 per-staff 持有断言）、`manage-tab.test.tsx`/`record-detail.test.tsx`（编译干净 + 增强）。
- **Out**: 余额展示/充值（spec 03）；单价/拆分（spec 04）；综合流水（spec 05）；`-1` 种子行本身（spec 01 已 INSERT）。

## Context

- ADR-0002（派生不存储——shopAggregate 派生逻辑不改）、ADR-0005（数据流层 invalidation）、ADR-0006（测试 seam：data InMemory + ui RNTL）、ADR-0004（smoke 是生产代码，非 Jest）。
- CONTEXT invariant #5（欠货允许——全局库存可为负）。
- 破坏面（PRD Further Notes 四类）：Inventory 三方法、reads.ts 三 hooks、query-keys 三 key family、smoke behavior-script、UI staff-row/staff-detail「库存」展示、record-detail.test/manage-tab.test。
- 现有 `shopAggregate`（inventory.ts）本就跨 staff 求和，语义重定义不需改派生逻辑——`in` 只来自 `-1`、`out` 来自会员，自然落在 shopAggregate。
- `direction='in'` 校验一加即破坏 smoke 步骤 14（原脚本给普通会员 create 'in'），故 smoke 改造必须在同一 spec 内完成。

## Design

- **Interface delta**
  - `StaffRepository`：`list`/`listActive`/`search` 默认排除 `staff_id='-1'`（含 `includeVoided:true`）；`void('-1')` 抛错。
  - `StockRecordRepository.create`：`direction='in'` 时强制 `staff_id='-1'`，否则抛错；`direction='out'` 的 staff_id 不受约束。**`update` 同守卫**：`patch.direction='in'` 时也强制 `staff_id='-1'`（防止编辑绕过方向约束——当前 UI 编辑不传 direction，但数据层 invariant 要闭合）。
  - `Inventory`：删除 `balance`/`staffInventory`/`staffSummaries` 方法 + `StaffSummary`/`Balance` 类型导出；仅留 `shopAggregate`（+ `Aggregate` 类型）。
  - `query-keys`：移除 `inventory.staffSummaries`/`staff`/`balance`（`inventory` 仅留 `all` + `shopAggregate`）。
  - `reads`：移除 `useStaffSummaries`/`useStaffInventory`/`useBalance`。
  - UI：`manage-tab` 加「补货」段（补货入库表单 → `useCreateStockRecord`，`staff_id='-1'`）；`bookkeeping`/`staff-row`/`staff-detail` 移除 per-staff 库存依赖，留占位骨架（余额展示留 spec 03）；`staff-row` 移除「入库」按钮。

- **Internal architecture**
  - **'-1' 过滤在 repo 层一处**：`list`/`listActive`/`search` 默认排除，所有消费者（记账/汇总/管理）自动受益，无需各自过滤。
  - **shopAggregate 派生逻辑不改**：本就跨 staff 求和；`in` 只来自 `-1`、`out` 来自会员后，语义自然收敛为全局库存（欠货允许负）。
  - **占位骨架策略**：UI 先拆除废弃依赖使编译干净，余额/单价展示留给 spec 03/04 填——避免两个域的 session 同时改同一 UI 文件（合并冲突）。
  - **smoke 同 spec**：`direction='in'` 校验一加即破坏 smoke 步骤 14（原给普通会员 create 'in'），故 behavior-script 改造必须在本 spec 内完成。

- **Deep-module note**：`Inventory` 从"per-staff 持有 + 全局汇总"多职责收窄为"仅全局库存"——职责变纯、接口变小，是 `/codebase-design` DEEPENING 的自然结果（废弃 per-staff 即深化）。

## Rework on failure

废弃面广但孤立于新功能——失败 redo 本 spec（数据层废弃 + 消费者占位 + smoke/测试迁移）；新表/余额/单价不受影响。

## Comments

- 2026-07-11 — implemented via `/tdd`（单阶段合并提交：新行为 + 废弃 + smoke 改造 + 全量 fixture 迁移，避免 inventory.test 等被双重改动）。AC → 测试：
  - StaffRepo 排除 `-1`（list/listActive/search/includeVoided）+ void 守卫 + getById 仍返 — `src/data/staff.test.ts::StaffRepository — admin '-1' protection`（4 tests）
  - StockRecordRepo create `direction='in'`↔`-1` 守卫 + update 同守卫 + `out` 不受约束 — `src/data/stock-record.test.ts::StockRecordRepository — direction guard`（3 tests）
  - 管理 tab 补货段（`-1` in）→ `shopAggregate` total_qty===10；member out ×3 → 7 — `src/components/manage-tab.test.tsx::ManageTab — restock segment`（3 tests）
  - smoke 改造为 `shopAggregate` + `-1` 补货口径；不再调 `balance`/`staffInventory`；InMemory 半边通过 — `src/data/smoke/behavior-script.test.ts`（5 tests）+ `src/data/smoke/behavior-script.ts`（restock→member-out→void 链，欠货 -2 收尾）
  - `tsc --noEmit` 通过（废弃干净：inventory 三方法/两类型删，query-keys/reads 三 hook 删，bookkeeping/staff-row/staff-detail 占位骨架编译干净）— `npx tsc --noEmit` → 0 errors
  - 欠货：out > 全局库存 → `shopAggregate` total_qty 为负，create 不拦截 — `src/data/inventory.test.ts::Inventory — 欠货 (negative global stock)`；smoke "shopAggregate: global stock after restock void (negative)"
  - `jest` 全绿：`in` 存量 fixture 全迁移（`-1` restock 或改 `out`），废弃方法断言全迁移 — `npx jest` → 222 passed, 0 failed（28 suites）
- 数据层：`staff.ts` 加 `ADMIN_STAFF_ID='-1'` 常量 + repo 层一处过滤 + void 守卫；`stock-record.ts` create/update 守卫；`inventory.ts` 收窄为仅 `shopAggregate`（+ `Aggregate`），删 `balance`/`staffInventory`/`staffSummaries`/`Balance`/`StaffSummary`。
- 流层：`query-keys.ts` 删 `inventory.staffSummaries`/`staff`/`balance`；`reads.ts` 删 `useStaffSummaries`/`useStaffInventory`/`useBalance`；`mutations.ts` 注释更新。
- UI 占位骨架（余额/单价留 spec 03/04）：`staff-row.tsx` 删 summary prop + 库存行 + 欠货 badge + 入库按钮；`bookkeeping/index.tsx` 删 useStaffSummaries + onIn；`staff-detail.tsx` 删 holdings 卡（保留历史区）；`manage-tab.tsx` 加 补货段（`RestockManage` → `useCreateStockRecord`, `staff_id=ADMIN_STAFF_ID`）。
- 测试迁移波及：`inventory.test`（重写为 shopAggregate 全局模型 + 欠货）、`daily-flow.test`（restock→-1 / member out 分行）、`stock-record.test`（21 fixture 迁移）、`reads.test`/`record-detail.test`/`manage-tab.test`（删废弃 hook + restock 覆盖）、`staff-row.test`/`bookkeeping-tab.test`（占位骨架）、`staff-detail.test`（删 holdings）、`summary-tab.test`/`record-form.test`（fixture 迁移）、`behavior-script`(.test)。
- **[手动/发布门]** 真实 SQLite 迁移（v3）下 `-1` 种子 + direction 守卫的运行时行为仅设备 smoke 覆盖（ADR-0004，发布前手跑）。
- Codemap / CONTEXT.md 术语更新延后到 `/sdd-flow` Stage 4。

