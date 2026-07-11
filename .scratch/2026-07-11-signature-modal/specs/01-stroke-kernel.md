# 笔迹内核：状态机 + SVG path 序列化

Type: spec
Status: ready-for-human
Parent: #01 (01-signature-modal.md)
Blocked by: None — can start immediately

## Goal

提供签名笔迹的纯逻辑内核——`strokeReducer`（加减笔 / 撤销 / 清除）+ `serializePath`（笔迹 → SVG path `d` 字符串），不依赖 React / RN，可独立 Jest 单测。供 SignatureModal 组件（spec #02）消费。

## Acceptance criteria

- [ ] `addStroke` 多次 → `strokes` 数组逐次增长（每条落笔独立入列）— 证明笔迹收集
- [ ] `undo` → 移除最后一条落笔；`strokes` 为空时 `undo` 保持空（无越界）— 证明逐笔撤销
- [ ] `clear` → `strokes` 归空 — 证明一键清除
- [ ] `serializePath(strokes)` 多笔 → 串接的 `M x,y L x,y ...` SVG path（每笔一个 `M` 子路径）— 证明多笔序列化
- [ ] `serializePath` 单笔多点 → 以 `M` 起始、后续点以 `L` 连接 — 证明单笔折线
- [ ] `serializePath(空 strokes)` → 空字符串（驱动组件"确认 disable"判定）— 证明空状态契约

## Scope

- **In**：`strokeReducer`（纯 reducer）+ `serializePath`（纯函数）+ 笔迹类型（`Point` / `Stroke` / `Action` / `Strokes`）+ Jest 单测。
- **Out**：SignatureModal 组件、手势捕获、光栅化、UI、依赖安装、主题色。

## Context

- 测试 seam：`data` project（ts-jest，node 环境，`*.test.ts`）—— ADR-0006 纯逻辑 Jest 范式；先例 `src/components/date-format.test.ts`、`record-form-validation.test.ts`（纯 predicate / 格式化函数，同 project，不限定 `src/data/`）。
- 不碰数据层 / `StoragePort` —— 本模块是组件级纯逻辑，与 shop-note 领域（CONTEXT.md）无关；无 ADR 冲突。
- 模块放置：`src/components/` 下与 SignatureModal 同一区域（router-agnostic 纯逻辑，见 codemap Module Index）。

## Design

- **Interface delta**：
  - 类型 `Point = { x: number; y: number }`；`Stroke = { points: Point[] }`；`Strokes = Stroke[]`。
  - `StrokeAction = { type: 'addStroke'; stroke: Stroke } | { type: 'undo' } | { type: 'clear' }`。
  - `strokeReducer(state: Strokes, action: StrokeAction): Strokes`。
  - `serializePath(strokes: Strokes): string`（空 → `''`；非空 → `M x,y L x,y ...` 串接）。
  - 表面小而深：两个函数 + 几个类型，隐藏全部笔迹状态机 + path 编码细节（**deep-module**：消费者只需 dispatch + serialize，不关心点如何累积成笔、笔如何编成 path）。
- **Internal architecture**：
  - 纯函数模块，零 React/RN 依赖（node 环境直接单测，无需任何 harness）。
  - 状态 = `Stroke[]`（每条落笔一个元素，顺序即绘制顺序）；`undo` = pop 尾部；`addStroke` = push；`clear` = `[]`。
  - `serializePath`：每条 stroke 产出一个 `M <p0> L <p1> L <p2> ...` 子路径，多条以空格串接；空数组产 `''`。
  - 实现细节（坐标取整 / 精度、path 命令大小写）留给 `/tdd`。
- **Test seam**：纯函数 + reducer —— Jest 直接断言 state / path 字符串演变；单一 external seam（node 测试）。

## Rework on failure

失败隔离；纯逻辑无外部耦合，重做本 spec 即可——仅 `strokeReducer` / `serializePath` 的 interface 形状需与 #02 双方对齐。

<!--
Evidence comment — appended by /tdd on close (not part of the design skeleton).
Shape:
  > **Comment** — implemented <date>; Status → ready-for-human
  > - [x] <criterion> — `tests/...::test name`
  > - Test run: `<command>` → N passed, 0 failed
  > - Commit: `<sha>`
Pointers only; no narration or source pasting.
-->

> **Comment** — implemented 2026-07-11; Status → ready-for-human
> - [x] `addStroke` 多次 → `strokes` 数组逐次增长 — `stroke-kernel.test.ts::appends each addStroke to the strokes array (grows on every stroke)`
> - [x] `undo` → 移除最后一条；空时保持空 — `stroke-kernel.test.ts::removes the last stroke on undo` + `keeps an empty array empty on undo (no out-of-bounds)`
> - [x] `clear` → `strokes` 归空 — `stroke-kernel.test.ts::empties the strokes array on clear`
> - [x] `serializePath` 多笔 → 串接的 `M x,y L x,y ...` — `stroke-kernel.test.ts::concatenates each stroke as a separate M sub-path separated by spaces`
> - [x] `serializePath` 单笔多点 → `M` 起始、`L` 连接 — `stroke-kernel.test.ts::starts with M then connects subsequent points with L`
> - [x] `serializePath(空)` → 空字符串 — `stroke-kernel.test.ts::returns an empty string for empty strokes`
> - Test run: `npx jest src/components/stroke-kernel.test.ts --forceExit` → 7 passed, 0 failed
> - Commit: `183df44`
