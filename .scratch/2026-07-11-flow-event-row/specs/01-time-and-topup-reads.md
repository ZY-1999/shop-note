# 含秒时间格式 + 充值读模型扩展

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: None — can start immediately

## Goal

为流水行与详情页提供秒级时间格式化，并扩展充值列表/单条读取能力（含 `date_range` 过滤），供后续 UI specs 消费。

## Acceptance criteria

- [ ] `formatTimeSeconds(ms)` 输出本地 `HH:mm:ss`（data project 确定性测试）— 证明秒级时间格式可用
- [ ] `formatDateTimeSeconds(ms)` 输出本地 `YYYY/MM/DD HH:mm:ss`（data project 测试）— 证明详情页时间格式可用
- [ ] 现有 `formatTime` / `formatDateTime` 调用方行为不变 — 证明无全局迁移副作用
- [ ] `TopupRepository.list({ date_range })` 仅返回窗口内充值（对标 stock-record 内存过滤测试）— 证明汇总 drill-down 可范围查询
- [ ] `useTopupById(id)` 返回含已作废记录 — 证明详情页可读历史作废充值
- [ ] `useTopups` 接受扩展 filter（`staff_id?`, `date_range?`）— 证明 hook 与 repo 对齐
- [ ] `RecordDetail` 头部时间改用 `formatDateTimeSeconds`，替换 `toLocaleString()` — 证明出库详情与列表秒级一致

## Scope

- **In**: `date-format.ts` 新函数及测试；`TopupRepository.list` date_range；`useTopupById` + `useTopups` filter 扩展；`RecordDetail` 时间展示。
- **Out**: `FlowEventRow`、充值详情页、列表行接入、作废 UI 变更。

## Context

- PRD: `.scratch/2026-07-11-flow-event-row/01-flow-event-row.md`
- 现有 `formatTime` 仅 `HH:mm`；`TopupRepository.getById` 已存在；`qk.topups.byId` 已登记但无 hook
- `StockRecordRepository.list` 的 `date_range` 内存过滤为 prior art
- ADR-0006: data project 测纯函数，RNTL 测 `RecordDetail` 行为

## Design

- **Interface delta**
  - `formatTimeSeconds(ms: number): string` → `HH:mm:ss`
  - `formatDateTimeSeconds(ms: number): string` → `YYYY/MM/DD HH:mm:ss`
  - `TopupRepository.list(opts?: { staff_id?: string; date_range?: { from?: number; to?: number } })`
  - `useTopupById(topupId: string): UseQueryResult<Topup | null>`
  - `useTopups(filter?: { staff_id?: string; date_range?: { from?: number; to?: number } })` — 扩展 filter 形状
  - `RecordDetail` 展示层改用 `formatDateTimeSeconds(record.timestamp)`
- **Internal architecture**
  - `date_range` 过滤在 repo `list` 内内存执行（与 stock-record `matchesFilter` 同 idiom），不新增 schema
  - `useTopupById` queryFn 调 `repos.topups.getById`；void 后靠现有 `qk.topups.all` 前缀失效刷新
- **Deep-module note**: date-format 模块继续作为全 app 时间展示单源；本 spec 只扩展秒级变体

## Rework on failure

回滚本 spec 改动；后续 UI specs 依赖此读模型，需先修复再继续。
