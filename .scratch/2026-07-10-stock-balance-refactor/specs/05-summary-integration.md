# 汇总 tab 综合: 综合流水 + 单数零售聚合 + 库存卡

Type: spec
Status: ready-for-agent
Parent: #01 (01-stock-balance-refactor.md)
Blocked by: #03, #04

## Goal

汇总 tab 改为全局库存卡（shopAggregate，as-of-now）+ 综合流水（补货/出库/充值按天）+ 出库单数零售聚合；`-1` 补货只以「补货」事件出现在流水时间轴，不在会员维度展示。

## Acceptance criteria

- [ ] 汇总库存卡展示全局库存 per-product + total（shopAggregate，与时间段无关）。——US6
- [ ] 综合流水含三类事件：补货（`-1` 的 in）、出库（out）、充值（topup），按天分组、最新在前；金额口径正确（补货/出库=Σline_amount，充值=amount）。——US7
- [ ] 流水中 `-1` 补货事件标注「补货」类型，不显示会员名、不作为会员行；会员列表/汇总不含 `-1`。——US12 汇总侧
- [ ] 本时间段出库聚合显示「X 单 + ¥Y 零售」（每笔 out 用其快照单价经 splitBundleRetail 派生后求和）；单价变动后旧记录仍用各自快照。——US8
- [ ] summary-tab.test 覆盖三类事件流水 + 单数零售聚合 + `-1` 隐藏；原有库存卡/时间段/day-collapse（ADR-0007）不回归。

## Scope

- **In**:
  - 数据层：dailyFlow（daily-flow.ts）扩展为综合流水（补货/出库/充值三类事件，DailyFlowRow 加 event_type 或 topup_amount）。
  - 流层：useDailyFlow 消费扩展流水；useCreateTopup/useVoidTopup 的 onSuccess 加 invalidate `qk.dailyFlow`（充值事件进流水）。
  - UI：summary-tab 流水区显示三类事件 + `-1` 标「补货」不显示会员名；新增「出库单数零售聚合」段（每笔 out 用其 unit_price_snapshot 经 splitBundleRetail 派生求和）；库存卡不变；summary-tab.test 覆盖。
- **Out**: 其他 tab；dailyFlow 之外的派生；充值作废入口（spec 03 staff-detail）。

## Context

- ADR-0002（派生不存储——综合流水派生）、ADR-0007（列表分批渲染——长流水）、ADR-0006（ui 测试 seam）。
- 现有 dailyFlow（daily-flow.ts）按 day×staff in/out line_amount；本 spec 扩展含 topup。
- 依赖：shopAggregate 全局库存（spec 02 重定义）、splitBundleRetail（spec 04）、TopupRepository + unit_price_snapshot（spec 03/04 落地）。
- summary-tab 现有结构：时间段 selector + 库存卡（as-of-now）+ day×staff 流水 + day-collapse（ADR-0007）。

## Design

- **Interface delta**
  - `dailyFlow` 扩展为综合流水：`DailyFlowRow` 加 `event_type: 'restock'|'out'|'topup'`（补货/出库用 line_amount，充值用 amount）；按天分组、最新在前。`DailyFlow` 构造加 `TopupRepository` 依赖。
  - `useDailyFlow` 消费扩展流水（query-key `qk.dailyFlow` 不变）。
  - `useCreateTopup`/`useVoidTopup`（spec 03 定义）的 onSuccess 增 invalidate `qk.dailyFlow`（dailyFlow 此时才含充值事件，故此 invalidate 归本 spec，spec 03 不含）。
  - UI：`summary-tab` 流水区显示三类事件（`-1` 补货标「补货」、不显示会员名、不作为会员行）；新增「出库单数零售聚合」段（本时间段每笔 out 用其 `unit_price_snapshot` 经 `splitBundleRetail` 派生后 Σ bundles / Σ retail）；库存卡不变（`shopAggregate` as-of-now）。

- **Internal architecture**
  - **综合流水是 dailyFlow 的扩展**（同派生范式，不存储）：合并 stock_record in/out + topup，按天。`-1` 补货事件按 `event_type='restock'` 标注，不进会员维度（US12）。
  - **单数零售聚合**：每笔 out 用其**自身快照单价**（非当前单价）经 splitBundleRetail 派生后求和——单价变动不影响历史聚合。
  - 库存卡仍用 shopAggregate（range 无关，as-of-now）——口径不变。
  - 长流水沿用 ADR-0007 分批渲染。

- **Deep-module note**：dailyFlow 从"库存 in/out 流水"扩展为"综合流水"——仍是单一派生读，事件类型扩展但接口不膨胀（一个 `flow()` 返回综合行）。

## Rework on failure

汇总是集成收口——失败 redo 本 spec（dailyFlow 扩展 + summary-tab 综合流水/聚合）；前置域（库存/余额/单价）不动。
