# 汇总 — day section 可折叠（默认收起）

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean；day section 改为可折叠卡（默认收起 + chevron），库存卡/员工行展开/分批/时间段/他处刷新 全无回归
Parent: #01-page-refactor（后续增强；#05 summary-rewrite 已 ship）

## Goal

汇总页流水区的「每日 day section」当前是静态分隔条——天头（日期 + 当日入库/出单总额）始终展开、其下各员工行始终平铺。运营者扫账时一屏铺满多天×多员工，信息密度高、难聚焦。

把它改成**可折叠卡片**，镜像现有「库存卡」（`inventoryOpen`）模式：默认收起，只显示天头（日期 + 当日入库/出单 + chevron）；点天头切换展开/收起，展开后才渲染当日各员工行。员工行→记录明细的二级展开（`expandedStaffDay`）保持不变。

## Acceptance criteria

- [ ] 每个 day section 默认**收起**：天头（日期 + 入库/出单总额 + chevron-down）渲染，但当日员工行（`staff-row-...`）不在 DOM。
- [ ] 点天头（`day-{YYYY/MM/DD}`）→ 展开：chevron 翻 up，当日各员工行出现。
- [ ] 再点同一天头 → 收起：员工行消失（独立于 `expandedStaffDay` 的二级展开态；天头折叠/展开不丢失已展开的员工行明细态）。
- [ ] 多个 day section 的展开态相互独立（同时可开多个）。
- [ ] 库存卡（`inventory-toggle`）、员工行展开（`staff-row-...` → `flow-record-...`）、按天分批（`load-more-days`）、时间段切换、他处写入刷新——均**无回归**。
- [ ] 天头仍带当日入库/出单总额（折叠态也能扫到当天进出），天头排序仍是倒序、分批行为不变（天头始终在批内渲染，折叠只控员工行可见性）。

## Scope

- **In**: `components/summary-tab.tsx`（`renderDay` 把天头 `View` → 可折叠 `Pressable`，新增按天展开态，员工行条件渲染）；`summary-tab.test.tsx`（新增 day 折叠契约测试 + 更新 AC4/AC5：断言员工行前先展开天）。
- **Out**: 读模型 / hook 签名 / 数据层 / 时间段 / 分批逻辑 / 库存卡 / 员工详情屏——均不动。

## Context

- 现状（#05 已 ship）：`renderDay` 天头是 `<View testID={day-...}>`（静态），下接 `item.staffRows.map(...)`（始终渲染）。库存卡是折叠样板：`useState(false)` + `Pressable` 切换 + chevron-up/down。
- 设计参考：`summary-tab.tsx` 库存卡（`inventoryOpen`）、员工行（`expandedStaffDay`）；`staff-detail.tsx` 库存段折叠（同款）。
- React Compiler 已开启：新增 `useState<Set<string>>` 遵循 rules-of-react（返回新 Set，不就地 mutate）。

## Design

- **Interface delta**: 无。`<SummaryTab onOpenStaff onOpenRecord? now?>` 签名不变——折叠是纯本地 UI 态。
- **Internal architecture**:
  - 新增 `const [openDays, setOpenDays] = useState<Set<string>>(new Set())`（按 `dateDash` key，默认空集 = 全收起）。
  - `toggleDay(dateDash)`：返回**新 Set**（删/增），不就地 mutate（React Compiler / 确定性渲染）。
  - `renderDay`：天头 `<View>` → `<Pressable onPress={toggleDay(item.dateDash)}>`，末尾加 `Ionicons chevron-up/down`（按 `openDays.has(item.dateDash)`）；员工行 `{dayOpen && item.staffRows.map(...)}`。
  - 天头日期 Text 加 `flex: 1`（与库存卡 `cardTitle` / 员工行 `title` 一致），把总额 + chevron 推到右端，卡片头视觉统一。
- **Deep-module note**: 纯 UI 态增量，无新逻辑/新查询；仍是派生读上的薄组合（ADR-0002）。

## Rework on failure

只读视图、无数据风险。若折叠态在分批 reveal / 时间段切换后异常 → 检查 `openDays` 是否被错误重置（应仅在用户点击时变）。重写隔离在 summary-tab + 其测试。

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 204 passed（含本 spec 2 个新测试 + #05 AC4/AC5 更新为「先展开天」）；`npx tsc --noEmit` → exit 0。

- **AC1（day 默认收起：天头在、员工行不在）** → `src/components/summary-tab.test.tsx` "hides a day's staff rows by default, reveals them on tap, hides again on second tap"（`day-2026/07/09` 在；默认 `staff-row-2026-07-09-${id}` 不在 DOM）。GREEN。
- **AC2（点天头展开 → chevron up + 员工行出现）** → 同一测试（点 `day-2026/07/09` → `staff-row-2026-07-09-${id}` 出现）。GREEN。
- **AC3（再点同天头收起 → 员工行消失；不丢员工行明细态）** → 同一测试（第二次点 `day-2026/07/09` → 员工行 again 不在）。`expandedStaffDay` 与 `openDays` 是独立 state，天折叠/展开不重置员工行展开态。GREEN。
- **AC4（多天展开态相互独立）** → "keeps each day's expand state independent (two days can be open at once)"（展开 07/09 后 07/08 员工行仍不在；再展开 07/08 → 两天员工行都在）。GREEN。
- **AC5（库存卡 / 员工行展开 / 分批 / 时间段 / 他处刷新 无回归）** → #05 既有 6 测试全 GREEN（AC1 时间段、AC2 库存卡、AC4 天分组[更新为先展开天]、AC5 员工行展开→记录[更新为先展开天]、AC6 分批、AC7 他处刷新）；`openDays` 折叠与分批 `visibleDays` slice 正交（天头始终在批内渲染，折叠只控员工行可见性）。GREEN。
- **AC6（天头仍带当日入库/出单总额 + 倒序 + 分批不变）** → AC4 天头排序断言（`day-2026/07/09` 排在 `day-2026/07/08` 前）+ AC6 分批断言（`getAllByTestId(/^day-/)` 计数）未改、仍 GREEN。GREEN。

**改动范围**：`src/components/summary-tab.tsx`（`renderDay`：天头 `View`→`Pressable` + chevron + `openDays` 条件渲染；新增 `openDays` state + `toggleDay`；`dayDate` 加 `flex:1`；doc 注释同步）+ `src/components/summary-tab.test.tsx`（2 个新 day-collapse 测试 + AC4/AC5 更新为先展开天）+ `docs/codemap/project.md`（summary capability 描述 + Updated 条目）。`<SummaryTab onOpenStaff onOpenRecord? now?>` 签名不变——折叠是纯本地 UI 态，读模型/hook/数据层全未动。

Commit: see `feat(summary): day section 可折叠（默认收起，镜像库存卡）` (this spec's Stage 2 commit).

## Comments

- 2026-07-10 — drafted as a follow-up enhancement to #05 (page-refactor, 已 ship). 路由自 `/route` → `/tdd`：模式已知（库存卡折叠）、范围小、AC 清晰，直接测试先行。
