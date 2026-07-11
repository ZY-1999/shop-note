# SignatureModal 组件：SVG 画布 + 光栅化 + 受控契约

Type: spec
Status: ready-for-human
Parent: #01 (01-signature-modal.md)
Blocked by: #01

## Goal

交付 `SignatureModal`——全屏受控 Modal，`react-native-svg` 渲染笔迹 + `react-native-gesture-handler` 捕获手势 + `react-native-view-shot` 光栅化成 PNG base64，`onConfirm(base64)` / `onCancel()` 回调；不碰数据层、不落盘、不开路由。

## Acceptance criteria

- [ ] `visible=true` → 渲染签字画布区 + 撤销 / 清除 / 确认 / 取消 四个按钮 — 证明入口完整
- [ ] `strokes` 为空 → "确认" disabled；`strokes` 非空 → "确认" enabled — 证明空签名不变式（依赖 spec #01 `serializePath(空)=''`）
- [ ] 点"撤销" → 当被撤销到空时，"确认"翻转为 disabled（经 #01 reducer 移除最后一笔）— 证明逐笔撤销接线
- [ ] 点"清除" → `strokes` 全清，"确认"回到 disabled — 证明一键清除接线
- [ ] 点"确认"（有笔画时）→ `onConfirm` 被调用，参数为 string（`jest.mock` 掉 `rasterize` 模块返回带前缀的 fake data URI，与 AC #7 同一 mock）— 证明确认契约
- [ ] 点"取消" → `onCancel` 被调用，组件不调用 `onConfirm` — 证明取消契约
- [ ] `onConfirm` 的 base64 参数**不含** `data:image/png;base64,` 前缀（mock `rasterize` 返回带前缀的 data URI，断言 `onConfirm` 收到的是剥离后的纯 base64）— 证明输出归一化
- [ ] router-agnostic：组件可在 RNTL 下直接渲染（无 router 依赖）；`visible=false` → 不渲染画布区 — 证明受控契约

## Scope

- **In**：`SignatureModal` 受控组件（props: `visible` / `onConfirm` / `onCancel`）、`rasterize` 隔离模块（包 `react-native-view-shot`，可 `jest.mock`）、安装 `react-native-svg` + `react-native-view-shot`、RNTL 测试（mock `rasterize` + 经 #01 reducer 驱动笔画）、横向 Modal 布局、StyleSheet + theme token。
- **Out**：消费者集成（record-form 等）、数据层改动、落盘（`expo-file-system`）、demo / 调试入口、真实手势手感 / 真实光栅化产物 / 横向布局真机效果 / 深色模式（→ device smoke，后置到集成 PRD，按 PRD Q5 决定）。

## Context

- 测试 seam：`ui` project（jest-expo + RNTL，`*.test.tsx`）—— ADR-0006；harness `src/testing/render.tsx`（`renderWithProviders`）+ `src/testing/async.ts`（`waitForSync` / `flushPending`）。**`fireEvent.*` 必须 `await`**（RNTL v14 async，codemap Risk Areas）。
- 本组件**不碰数据层** → 无需 `InMemoryAdapter` / ReposProvider；可复用 `renderWithProviders` 或更轻的纯 render。
- 样式：ADR-0005（StyleSheet + `src/constants/theme.ts` 语义 token `success` / `danger` / `warning` / `border` / `accent`）。
- 依赖：新增 `react-native-svg` + `react-native-view-shot`（`npx expo install` 选 SDK 57 兼容版）；`react-native-gesture-handler` 已在 `package.json` 但**项目源码零 import**——本组件是它的首次显式使用（codemap External Dependencies + Risk Areas）。
- 装完按 PROJECT_KNOWLEDGE `expo start --clear`（清 Metro / Hermes 缓存）。
- 消费 spec #01 的 `strokeReducer` + `serializePath` + 类型。
- React Compiler 已开启（`app.json` experiments）——组件 hook 遵循 rules-of-react。

## Design

- **Interface delta**：
  - `SignatureModal`：`props = { visible: boolean; onConfirm(base64: string): void; onCancel(): void }`（+ 可选主题 / 文案覆盖，spec/tdd 定）。
  - `rasterize(viewRef): Promise<string>` —— 生产实现包 `react-native-view-shot` `captureRef`，返回其原始 data URI（**可能带 `data:image/png;base64,` 前缀**，不做内部剥离）；RNTL 测试以 `jest.mock` stub 整模块返回带前缀的 fake data URI。这是隔离原生光栅化的 seam。
  - **base64 归一化在组件侧**（非 `rasterize` 内）：组件拿到 `rasterize` 的原始串后，自行剥离 `data:...;base64,` 前缀再回传 `onConfirm`。这样 `jest.mock` 掉 `rasterize` 后归一化逻辑仍留在被测代码里，AC #7 可验证（否则 stripping 会被 mock 连带替掉）。
- **Internal architecture**：
  - 组件内 hook 封装 #01 的 `strokeReducer`（state ownership：组件持有 `strokes`，dispatch `addStroke` / `undo` / `clear`）。
  - `react-native-gesture-handler` 捕获画布拖拽 → 落点累积成当前 stroke → 手指抬起 dispatch `addStroke`。
  - `react-native-svg` `<Path d={serializePath(strokes)} />` 渲染全部笔迹（`strokes` 变化即重渲染）。
  - "确认"：`disabled = strokes.length === 0`；点击 → `const raw = await rasterize(svgRef)` → 组件内剥离 `data:image/png;base64,` 前缀（纯字符串操作，不被 `rasterize` 的 mock 影响）→ `onConfirm(纯 base64)`。
  - 横向布局：RN `<Modal>` 全屏 + `StyleSheet` 画布区宽 > 高；**不引 `expo-screen-orientation`**（设备保持竖屏）。
  - `rasterize` 作为**独立模块**（非组件内联），使其可被 `jest.mock` 整模块替换。
  - 实现细节（按钮栏上 / 下位置、画布宽高比、笔画色 token、gesture API 具体形态）留给 `/tdd`。
- **Test seam**：RNTL 渲染组件，`jest.mock('./rasterize')` stub 光栅化；笔画经直接 dispatch reducer（或 `fireEvent` 驱动手势）注入，断言按钮 disabled 状态 + `onConfirm` / `onCancel` 调用 + base64 无 `data:` 前缀。单一 external seam（RNTL）。
- **Deep-module note**：`SignatureModal` 把"手势捕获 + 笔迹渲染 + 光栅化 + base64 归一化 + 空签名约束"全藏在 `visible + onConfirm + onCancel` 三个 prop 之后——表面 3 个 prop，背后一个完整签名能力（符合 deep-module；无需 DEEPENING 拆分）。

## Rework on failure

- 若 `react-native-view-shot` / `react-native-svg` / `gesture-handler` 显式使用在 Jest 阶段暴露导入或 mock 不可行 → 回退点是 `rasterize` 模块的隔离边界（调整 mock 粒度或抽更薄的接口）。
- 若不兼容到 spec / tdd 无法推进（真机才暴露的问题按 PRD 约定后置集成 PRD），失败隔离在本 spec——不回溯 #01（纯逻辑已独立验证）。

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
> - [x] visible=true → renders canvas + undo/clear/confirm/cancel — `signature-modal.test.tsx::renders the signature canvas + undo/clear/confirm/cancel buttons`
> - [x] empty → confirm disabled; non-empty → enabled — `signature-modal.test.tsx::disables confirm when strokes are empty` + `enables confirm after a stroke is drawn`
> - [x] undo to empty → confirm flips disabled — `signature-modal.test.tsx::flips confirm back to disabled after undoing the last stroke`
> - [x] clear → strokes cleared, confirm disabled — `signature-modal.test.tsx::clears all strokes and disables confirm`
> - [x] confirm with strokes → onConfirm called with string — `signature-modal.test.tsx::calls onConfirm with a string when confirm is pressed after drawing`
> - [x] cancel → onCancel called, onConfirm not called — `signature-modal.test.tsx::calls onCancel and does NOT call onConfirm when cancel is pressed`
> - [x] base64 prefix stripped in component — `signature-modal.test.tsx::strips the data:image/png;base64, prefix before passing to onConfirm`
> - [x] router-agnostic; visible=false → no canvas — `signature-modal.test.tsx::does not render the canvas area when visible=false` + `renders without any router or provider dependency`
> - Test run: `npx jest --forceExit` → 35 suites, 284 passed, 0 failed; `npx tsc --noEmit` clean
> - Commit: `fe25c41`
