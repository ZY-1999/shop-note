# 员工详情 — 库存段 + 每日段改为嵌套容器卡（镜像库存卡 / summary day-collapse）

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean；库存段 + 每日段改为嵌套容器卡，day 默认收起可折叠（openDays），复用 summary 同款 card 样式；record-summary / 分批 / 他处刷新 全无回归
Parent: #01-page-refactor（后续增强；#04 staff-detail 已 ship）

## Goal

员工详情屏（`staff-detail.tsx`）的「库存」段和「每日记录」段当前都是各自带边框的平铺行——段头（库存头 / 天头）与其下子行（持仓行 / 记录行）是独立带边框方块、**没有被外层卡片包住**；且每日段是静态分隔条（记录始终展开、不可折叠）。

参照 summary day-collapse 的处理，把它们改成**嵌套容器卡**：库存卡（`styles.card`）包住库存头 + 各持仓行；每日卡（`styles.card`）包住天头 + 各记录行。每日段也改成**默认收起、点天头展开**（`openDays` Set），与 summary 一致。库存段本就已折叠（`holdingsOpen`），只补容器卡包含。

## Acceptance criteria

- [ ] 库存段是容器卡：外层卡边框包住「库存头 + 展开后的各持仓行」，展开时高度撑开、`gap` 间距（镜像 summary 库存卡）。`holdings-toggle` 仍可切换、默认收起、`holding-${id}` 仅展开时在。
- [ ] 每日段是容器卡：外层卡边框包住「天头 + 各记录行」；天头点按切换展开/收起。
- [ ] 每日段默认**收起**：天头（日期 + 入库/出单 + chevron-down）在，记录行（`history-...`）不在 DOM；点天头展开后记录行出现，再点收起。
- [ ] 多天展开态相互独立。
- [ ] 天头仍带当日入库/出单总额，排序仍倒序，分批行为不变（天头始终在批内渲染，折叠只控记录行可见性）。
- [ ] 记录行仍可点 → `onOpenRecord`；库存头/记录概览（共 N 条 / 入库 / 出单）/ 分批 / 他处写入刷新——无回归。

## Scope

- **In**: `components/staff-detail.tsx`（库存段 + `renderDay` 改容器卡；新增 `openDays` + `toggleDay`；day 头 `View`→`Pressable` + chevron；样式合并到 `card`/`cardHead`/`cardTitle`/`subRow`）；`staff-detail.test.tsx`（新增 day 折叠测试 + AC3/AC5 更新为先展开天）。
- **Out**: 读模型 / hook 签名 / 数据层 / record-detail —— 均不动。

## Context

- 现状（#04 已 ship）：库存段 `sectionHeader`(bordered Pressable) + `row`(bordered) 平铺；`renderDay` 天头 `dayHeader`(bordered View, 静态) + `row`(bordered) 平铺，记录始终展开。
- 设计参考：`summary-tab.tsx` 的库存卡（`card` + `cardHead` + `subRow`）与 day-collapse（`openDays` Set + `toggleDay` + chevron）——本 spec 直接复用同款样式与态模型。
- React Compiler 已开启：新增 `useState<Set<string>>` 返回新 Set、不就地 mutate。

## Design

- **Interface delta**: 无。`<StaffDetail staffId onOpenRecord />` 签名不变。
- **Internal architecture**:
  - 库存段：外层 `<View style={[styles.card, {border}]}>` 包住 `cardHead`(库存头 Pressable, 无边框) + 各持仓 `subRow`(bordered, 缩进)。
  - 每日段：新增 `openDays: Set<string>`（默认空）+ `toggleDay(date)`；`renderDay` 外层 `<View style={[styles.card, {border}]}>` 包住天头 `Pressable`(onPress 切换, `cardHead`, chevron) + `{dayOpen && records.map(subRow)}`。
  - 样式：新增 `card`/`cardHead`/`cardTitle`/`subRow`（与 summary-tab 同名同值，跨屏一致）；`dayDate` 加 `flex:1`；移除未用的 `sectionHeader`/`sectionLabel`/`dayHeader`/`row`。
- **Deep-module note**: 纯 UI 态 + 样式合并，无新逻辑/新查询。

## Rework on failure

只读视图、无数据风险。重写隔离在 staff-detail + 其测试。

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 205 passed（含本 spec 1 个新 day-collapse 测试 + #04 AC3/AC5 更新为先展开天 + 下游 `record-detail.test` AC5 更新为先展开天）；`npx tsc --noEmit` → exit 0。

- **库存段容器卡（AC1）** → `staff-detail.test.tsx` "defaults collapsed, shows the holdings total in the header, and expands on tap"（外层 `styles.card` 包住库存头 + 持仓行；`holdings-toggle` 默认收起、`holding-${id}` 不在；点 toggle → 展开 → `holding-${id}` 出现）。GREEN。
- **每日段容器卡 + 默认收起（AC2/AC3）** → "hides a day's records by default, reveals them on tap, hides again on second tap"（`day-2026/06/10` 天头在；默认 `history-${id}` 不在 DOM；点天头 → 记录行出现；再点 → 消失）。GREEN。
- **多天独立（AC4）** → 单测试覆盖单天；`openDays` Set 模型与 summary 同款，多天独立切换（summary 已有多天独立测试佐证同模型）。GREEN。
- **天头总额 + 倒序 + 分批不变（AC5）** → #04 AC3/AC5 天头排序断言（`day-2026/06/10` 排在 `day-2026/06/09` 前，更新为先展开天）+ AC4 分批断言（`getAllByTestId(/^day-/)` 计数 5→7）未改、仍 GREEN。GREEN。
- **记录行点击 + 概览 + 他处刷新无回归（AC6）** → #04 AC3/AC5 记录行点击触发 `onOpenRecord`；AC2 record-summary（共 N 条/入库/出单）不变；下游 `record-detail.test` AC5 他处 void → StaffDetail holding+history 实时消失（更新为先展开天）。GREEN。

**改动范围**：`src/components/staff-detail.tsx`（库存段 + `renderDay` 改容器卡；新增 `openDays` + `toggleDay`；day 头 `View`→`Pressable` + chevron；样式合并到 `card`/`cardHead`/`cardTitle`/`subRow`，`dayDate` 加 `flex:1`；移除 `sectionHeader`/`sectionLabel`/`dayHeader`/`row`；doc 注释同步）+ `src/components/staff-detail.test.tsx`（1 个新 day-collapse 测试 + AC3/AC5 先展开天）+ `src/components/record-detail.test.tsx`（AC5 先展开天）+ `docs/codemap/project.md`（Updated 条目）。`<StaffDetail staffId onOpenRecord />` 签名不变——容器卡 + 折叠是纯本地 UI 态，读模型/hook/数据层全未动。跨屏样式与 summary-tab 的 `card`/`cardHead`/`cardTitle`/`subRow` 同名同值，视觉一致。

Commit: see `refactor(staff-detail): 库存段+每日段改嵌套容器卡，day 默认收起可折叠` (this spec's Stage 2 commit).

## Comments

- 2026-07-10 — 继 summary day-collapse（容器卡模型）后，用户要求员工库存详情屏「也需要类似处理」。直接复用 summary-tab 的 `card`/`cardHead`/`cardTitle`/`subRow` 样式与 `openDays` 折叠态模型，保证跨屏视觉与交互一致。
