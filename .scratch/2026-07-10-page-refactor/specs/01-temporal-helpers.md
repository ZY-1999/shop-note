# 纯函数 helpers — 日期格式化 + 时间段区间

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest (data project), tsc clean; pure helpers, no device surface
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

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest src/components/date-format.test.ts` → 11 passed / 1 suite (data project); `npx tsc --noEmit` → exit 0.

- **AC1 (formatDate/formatDateTime/formatTime, 本地天, 边界)** → `src/components/date-format.test.ts` "formats an epoch-ms timestamp as local YYYY/MM/DD with zero-padding"（`formatDate` → `2026/06/09`）+ "formats as local HH:mm with zero-padding"（`formatTime` → `09:05` / `14:30`）+ "formats as local YYYY/MM/DD HH:mm"（`formatDateTime`）+ "rolls the year/month boundary on local calendar day (story 4)"（Dec 31 23:59 → `2025/12/31`；Jan 1 00:05 → `2026/01/01 00:05`，月/年翻滚 + 个位补零）。GREEN。
- **AC2 (rangeFor 四 preset, 周一首, 跨月/跨年)** → "thisMonth spans local 1st 00:00:00.000 → last day 23:59:59.999"（from = 6/1 00:00:00.000, to = 6/30 23:59:59.999）+ "lastMonth spans the whole previous local month"（5/1 → 5/31）+ "lastMonth rolls into the previous year when now is in January"（1 月 now → 2025/12/1 → 2025/12/31，跨年）+ "thisWeek starts on Monday (Thursday → prior Monday)"（周四 → 周一 6/8，止于周日 6/14 23:59:59.999）+ "thisWeek treats Sunday as the end, not the start"（周日 now → 仍归当周周一 6/8，非 6/15——证明周一为周首、周日为周末）+ "lastWeek spans the Monday→Sunday before now's week"（6/1 → 6/7）。GREEN。
- **AC3 (纯函数, 无 RN import, node jest)** → 模块零 React/RN import；测试文件 `*.test.ts` 命中 `jest.config.js` 的 `dataLayerProject`（ts-jest + node env），PASS。范式同 `record-form-validation.ts`。GREEN。
- **AC4 (now 可注入, 确定性)** → 每个 rangeFor 测试都注入固定 `now` 断言精确 epoch ms；"output is driven by the injected now, not the wall clock"（两个不同 `now` → 不同 `from`，证明输出由 `now` 驱动、不被墙钟耦合）。GREEN。

**口径**：`formatDate` 用本地 `getFullYear/getMonth/getDate + padStart`，是 [daily-flow.ts](../../../src/data/daily-flow.ts) `dayBucket` 的展示双胞胎（同本地天口径、`/` 分隔）；`rangeFor` 的 `from/to` 均本地天 00:00:00.000 / 23:59:59.999 边界，周首日周一（`(getDay()+6)%7`）。

**消费方未动**：本 spec 仅落 helper + 单测；`#03`（formatDateTime）/ `#04`（formatDate + formatTime）/ `#05`（formatDate + formatTime + rangeFor）各自接线。

**无 device surface**：纯函数、无 UI、无原生模块——jest/node 即覆盖行为，无 device-pending 项。

Commit: see `feat(date-format): 时间 helpers — formatDate/DateTime/Time + rangeFor (#01)` (this spec's Stage 2 commit).
