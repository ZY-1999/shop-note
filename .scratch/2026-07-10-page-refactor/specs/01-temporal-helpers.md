# 纯函数 helpers — 日期格式化 + 时间段区间

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: None — can start immediately

## Goal

为三屏重构铺底的纯时间/日期 helpers：`formatDate` / `formatDateTime`（取代散落的 `toLocaleString()`，统一 `YYYY/MM/DD` 与 `YYYY/MM/DD HH:mm`，本地历日，与 `daily-flow.dayBucket` 同口径）与 `rangeFor(preset)`（本月/上月/本周/上周 → `{from, to}` epoch ms，本地天边界，周一为周首）——先于任何消费方落盘并 Jest 覆盖。

## Acceptance criteria

- [ ] `formatDate(ms)` → `'YYYY/MM/DD'`，`formatDateTime(ms)` → `'YYYY/MM/DD HH:mm'`，`formatTime(ms)` → `'HH:mm'`，均按**本地历日**（与 `daily-flow.ts` 的 `dayBucket` 同口径——单操作员 app 按本地天）——证明统一格式 + 本地天（故事 4）。测试覆盖月/年翻滚边界、个位月/日补零。
- [ ] `rangeFor('thisMonth' | 'lastMonth' | 'thisWeek' | 'lastWeek', now?)` → `{ from, to }`（epoch ms，本地天 00:00:00 起、23:59:59.999 止；周以**周一**为起算）——证明 4 个快捷时间段能驱动汇总的 `date_range`（故事 13）。测试四个 preset 各自边界、上周/上月跨月正确、周一为周首。
- [ ] 两个 helper 均纯函数、无 RN import / 副作用，可在 **node jest project** 跑（范式同 `record-form-validation.ts`）——证明可独立单测、不依赖渲染环境。
- [ ] `rangeFor` 接受可选 `now` 注入，测试用固定时间断言——证明可确定性测试（不被墙钟耦合）。

## Scope

- **In**: 一个新纯函数模块（如 `src/components/date-format.ts`，与 `record-form-validation.ts` 同级）；`formatDate` / `formatDateTime` / `rangeFor` + Jest 单测（node project）。
- **Out**: 任何 UI 消费（#03/#04/#05 消费）；改动 `daily-flow.dayBucket`（它保留；`formatDate` 是其展示双胞胎，同口径不改它）；汇总屏本身（#05）；时区/UTC 配置（本期不做，单操作员按本地天）。

## Context

- 先例：`record-form-validation.ts`（纯函数 + node Jest，spec #06 的可测范式）。
- 口径基准：`daily-flow.ts` 的 `dayBucket(ms)` 用本地 `getFullYear/getMonth/getDate` 产 `YYYY-MM-DD`；`formatDate` 产 `YYYY/MM/DD`（同本地天口径、不同分隔符——展示用）。
- PRD 全局规约：日期 `YYYY/MM/DD`、datetime `YYYY/MM/DD HH:mm`；周首日建议周一（spec 阶段待定 (b)）。
- `rangeFor` 喂给汇总的 `useDailyFlow({ date_range })` / `useStockRecords({ date_range })`（ADR-0007 分批驱动）。

## Design

- **Interface delta**:
  ```ts
  formatDate(ms: number): string                 // 'YYYY/MM/DD', local calendar day
  formatDateTime(ms: number): string             // 'YYYY/MM/DD HH:mm', local
  formatTime(ms: number): string                  // 'HH:mm', local
  type RangePreset = 'thisMonth' | 'lastMonth' | 'thisWeek' | 'lastWeek'
  rangeFor(preset: RangePreset, now?: number): { from: number; to: number }  // epoch ms, local-day bounds; week starts Monday
  ```
  `now` 默认 `Date.now()`，注入用于确定性测试。
- **Internal architecture**: 纯函数，全部基于 `Date` 的本地 getter（与 `dayBucket` 同）。`rangeFor` 算 preset 跨度的本地天起/止；周一为周首（`(day + 6) % 7` 天数偏移）。无状态、无副作用、无 RN 依赖——故能进 node project。
- **Deep-module note**: 这是一个工具模块，**不以深度为目标**——目标是消灭格式漂移（正是催生它的 bug）。三屏共享，集中以免各自重写走样。

## Rework on failure

隔离；某个格式/边界错 → 改 helper + 其单测，消费方在 render 时现算、自动跟随。
