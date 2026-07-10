# SignatureModal 签名弹窗组件（Signature Modal）

Type: prd
Status: ready-for-agent

## 问题陈述

店铺出单/收货场景里，经常需要一张可追溯的手写签字凭证。`shop-note` 目前的表单和记录都只有文字信息，没有签名留痕能力。

但"签名"作为一项**能力**，最底层是一个独立的、可复用的 UI 组件 —— 一个全屏横向手写画布，捕获笔迹，产出一张签名图。它不该和某个具体表单（出入库表单）或某个数据模型（stock_record 加列）绑死。

本 PRD 只交付这个**签名弹窗组件本身**：一个不依赖任何业务表单、不碰数据层、不落盘的纯 UI 积木。把它作为独立资产先做出来、测好，未来任何需要签名的场景（出入库签名、收据签名、交接确认…）都能复用它；首个真实消费者（出入库表单签名集成）留给后续 PRD，届时数据层、落盘、回显再整体设计。

（本 PRD 由 `../2026-07-10-signature/01-signature.md` 废弃后抽离重做，原整体签名功能 PRD 已 `wontfix`，仅作历史设计参考。）

## 解决方案

一个 **`SignatureModal`** —— 全屏受控 Modal，设备保持竖屏，签名画布横向铺开（宽 > 高的签字区，不引 `expo-screen-orientation`）。操作者画下笔迹，可逐笔撤销、一键清除，确认后组件产出一张签名 PNG（base64）；任何时候可取消。

组件是 **router-agnostic 的受控组件**：调用方持有 `visible` state，传入 `visible` / `onConfirm` / `onCancel`；组件本身不开新路由，便于在 RNTL 里直接渲染测试。

实现上不用第三方 WebView 签名库（`react-native-signature-canvas` 在 RN 0.86 / React 19.2 / Expo SDK 57 下兼容性风险高，且 WebView 是黑盒、无法在组件测试里驱动笔画），改用**自定义 SVG 画布**：`react-native-svg` 渲染笔迹 + 已装的 `react-native-gesture-handler` 捕获手势，确认时用 `react-native-view-shot` 把已渲染的笔迹节点光栅化成 PNG base64。

组件核心契约：
- **输入（props）**：`visible: boolean`、`onConfirm(base64: string): void`、`onCancel(): void`（+ 可选的主题/文案覆盖）
- **输出**：`onConfirm` 回调的 `base64` 为**纯 base64 字符串**（不带 `data:image/png;base64,` 前缀），消费者自行拼前缀预览或直接落盘
- **不变式**：无笔画时"确认"按钮 disabled —— 组件保证"产出必有内容"
- **行为**：逐笔撤销（每条落笔为一个可撤销单元）、一键清除全清

## 用户故事

1. 作为操作者，我想点"签名"进入横向全屏签字区，以便在竖屏设备上舒适地手写。
2. 作为操作者，我想画错时撤销最后一笔、或一键清除重画，以便改正。
3. 作为操作者，我想没画任何笔画时"确认"置灰不可点，以免产出空签名。
4. 作为操作者，我想点"确认"拿到签名图后回到调用方、点"取消"什么都不发生，以便我不被组件卡住。
5. 作为（未来的）调用方开发者，我想传入 `visible` + 两个回调就能用上签名能力、拿到 base64 PNG，以便把它接进任意表单。
6. 作为（未来的）调用方开发者，我想组件不碰我的数据层、不落盘、不开路由，以便签名捕获与我的业务逻辑彻底解耦。
7. （隐含）签名图可被消费者用于导出/分享/落盘/预览 —— 组件只负责产出 base64 PNG，用途由消费者决定。

## 实施决策

### 组件 API（受控契约）

- `SignatureModal` 是受控组件：`visible` prop 驱动显隐；`onConfirm(base64)` / `onCancel()` 回调。不持有自己的 visible state（调用方持有）。
- router-agnostic：不开新路由、不依赖 expo-router —— 可在 RNTL 里直接 `<SignatureModal visible={...} />` 渲染。
- `onConfirm` 的 `base64` 参数为**纯 base64（无 `data:image/png;base64,` 前缀）**。归一化责任在组件（`view-shot` 的 `captureRef` 若返回带前缀的 data URI，组件内部剥离后回传）。

### 笔迹内核（纯逻辑，抽离成 reducer + 序列化函数）

- 笔迹收集/撤销/清除/序列化是**纯状态逻辑**，抽成 `strokeReducer`（加减笔 / 撤销最后一笔 / 清除）+ `serializePath(strokes)`（把笔迹序列化成 SVG path `d` 字符串）。组件内的 hook 只是这层纯逻辑的薄封装。
- 这样纯逻辑可在 node 环境 Jest 单测（断言 path 状态演变），组件测试只覆盖交互→回调。
- 数据形状（来自设计决策）：每条落笔 = 一个点序列；`strokes` = 落笔数组；action = `addStroke` / `undo` / `clear`；`serializePath` 输出 `M x,y L x,y ...` 串接的多笔 path。空 `strokes` → 空字符串（驱动"确认 disable"）。

### 画布与渲染

- `react-native-svg` 的 `<Path d={serializePath(strokes)} />` 渲染当前所有笔迹；新增笔画时更新 strokes。
- `react-native-gesture-handler`（已装，~2.32）捕获拖拽手势，落点追加到当前 stroke；手指抬起时把当前 stroke 提交进 strokes。
- 横向布局：Modal 全屏，内部画布区宽 > 高（横向签字区），按钮栏在画布外侧（上/下栏 spec 阶段定）。**不引 `expo-screen-orientation`** —— 设备保持竖屏，仅画布横向铺开。

### 光栅化（笔迹 → PNG base64）

- "确认"时用 `react-native-view-shot` 的 `captureRef` 截已渲染的 SVG 笔迹节点，产出 PNG base64。
- 光栅化通过一个**可 mock 的 `rasterize` 模块**隔离：生产实现包 `view-shot`，RNTL 测试 stub 它返回 fake base64。这是组件测试不依赖真实原生能力的 seam。
- 光栅化是异步的：`onConfirm` 在 `captureRef` resolve 后回调（组件内部 await）。

### 空签名约束

- strokes 为空时，"确认"按钮 `disabled`（不可点）。"清除"后回到空状态，确认同样 disable。

### 主题与样式

- 沿用 RN `StyleSheet` + `theme.ts` 语义 token（ADR-0005），不引新样式范式。
- 笔画色 = 主题前景色（与画布背景取对比）；"确认"用 `theme.success`、"取消"用 `theme.danger`、"撤销"/"清除"用次要色。（具体 token 映射 spec 阶段定。）

### 依赖

- **新增**：`react-native-svg`（纯 JS SVG 渲染，Expo Go 兼容）、`react-native-view-shot`（视图光栅化）—— spec 阶段查 https://docs.expo.dev/versions/v57.0.0/ 核验 SDK 57 兼容版（用 `npx expo install <pkg>` 选版，勿裸装）。
- **gesture-handler（已装但未用过）**：`react-native-gesture-handler` 在 `package.json` 中已存在，但当前仅是 expo-router / react-native-screens 的传递性依赖 —— 项目源码**零 import**（无 `GestureHandlerRootView` 包裹、无 `Gesture.*` 使用）。本组件将是它的**首次显式使用**，因此手势捕获也是真机冒烟项（见"首要风险"）。
- `expo-image`（消费者预览用，组件本身不强依赖）。
- 装完按 PROJECT_KNOWLEDGE 规则 `expo start --clear`（增删依赖必须清 Metro/Hermes 缓存）。

## 测试决策

沿用 ADR-0006（RNTL + 用户行为驱动）+ ADR-0004（真实原生 → device smoke）的范式。本组件**不碰数据层**，故组件测试无需 `InMemoryAdapter`，比 ADR-0006 的典型屏幕更轻。

**好测试的标准**：只测外部可观察行为（渲染的按钮、disabled 状态、回调契约），不测组件内部 state；纯逻辑内核单独单测。

- **纯逻辑 → Jest（node，ts-jest，`data` project）**：
  - `strokeReducer`：addStroke → strokes 增长；undo → 最后一笔移除；clear → 空。
  - `serializePath`：多笔 → 串接的 `M..L..` path；空 strokes → 空字符串（驱动"确认 disable"）。
  - 复用既有纯逻辑单测范式（同 `record-form-validation`、`date-format` 等纯 predicate / 格式化测试，跑在 `data` project 的 node/ts-jest 环境）。
- **组件行为 → RNTL（jest-expo，`ui` project）**：
  - 渲染 SignatureModal（`visible=true`）：画布区 + 撤销/清除/确认/取消 四按钮可见。
  - 无笔画时"确认" disabled；strokes 非空后"确认" enabled。
  - 点"确认" → `onConfirm` 被调用，参数是 string（mock `rasterize` 返回 fake base64）；点"取消" → `onCancel` 被调用。
  - mock 策略：`rasterize` 模块（隔离 view-shot）+ gesture 落点经纯逻辑/`fireEvent` 驱动（不依赖真实手势）。
- **边界（RNTL 不覆盖，留 device smoke —— 本 PRD 后置到集成 PRD）**：真实 SVG 渲染、真实手势捕获手感、真实 `view-shot` 光栅化产物、横向 Modal 全屏布局、深色模式 —— 纯组件阶段无法验证，必须等有真实消费者的集成 PRD 时在真机冒烟。

## 范围外

- **任何消费者集成** —— 不接入 record-form、不接入任何表单/屏幕。组件是独立积木，首个消费者（出入库表单签名）是后续 PRD。
- **数据层任何改动** —— 不给 `stock_record`（或任何表）加列、不落盘、不存 DB、不碰审计。原废弃 PRD 的 `signature_path` 列 + 迁移 + 审计投影全部不在本 PRD。
- **文件系统/落盘** —— 不装 `expo-file-system`、不写文件、不管文件生命周期。组件只回传 base64 字符串，落盘归消费者。
- **锁屏横屏**（`expo-screen-orientation`）—— 用全屏 Modal 横向画布替代。
- **demo / 调试入口** —— 本 PRD 不含临时调用方；真机兼容性验证后置到集成 PRD。
- **WebView 签名库**（`react-native-signature-canvas`）—— 经决策放弃（兼容性 + 可测性）。
- 多签名、签名必填校验、签名时间戳/防伪/数字水印/笔迹压感、自定义笔粗细/颜色、签名导出/分享/打印 —— 组件只产出 base64 PNG，这些下游能力归消费者。

## 补充说明

- **关联**：[废弃的原签名功能 PRD](../2026-07-10-signature/01-signature.md)（`wontfix`，历史设计参考）、ADR-0005 UI 层架构、ADR-0006 UI 组件测试、ADR-0004 device smoke。
- **首要风险（明示）**：三个 native 能力（`react-native-svg` 渲染 / `gesture-handler` 手势 / `view-shot` 光栅化）在 **RN 0.86 新架构 + React 19.2 + Expo SDK 57** 下的真实兼容性，本 PRD **不在真机验证**（刻意承担）—— **集成 PRD 必须首先在真机冒烟**这三项，若某项不兼容，组件需返工。其中 `gesture-handler` 当前仅作传递性依赖、项目零使用先例（本组件是首次显式使用）；`view-shot` 要访问 native 视图层级 —— 两者均无项目内现成范例可参考。
- **本地优先**：组件本身不持久化任何东西；产出的 base64 在内存，消费者决定其生命周期。
- **React Compiler 已开启**：组件内 hook（封装 strokeReducer）遵循 rules-of-react；光栅化副作用集中在"确认"回调。
- **Expo SDK 57**：spec 阶段查 https://docs.expo.dev/versions/v57.0.0/ 核验 `react-native-svg` + `react-native-view-shot` 的 SDK 57 兼容版。
- **可能的 spec 拆分**（to-spec 决定，依赖序）：#01 笔迹内核纯逻辑（reducer + serializePath，Jest）；#02 SignatureModal 组件（SVG 画布 + gesture + 光栅化 + 受控契约 + RNTL 测试）。
- **git 语义**：本 PRD 写入 `.scratch/2026-07-11-signature-modal/01-signature-modal.md`，未提交 —— Gate 0 通过后由 `/sdd-flow` 入口提交；同时提交对废弃原 PRD 的 `wontfix` 标注。

## Comments

- 2026-07-11 — `/idea-to-prd` 流程起草。源自 `../2026-07-10-signature/01-signature.md` 的废弃 + 抽离：用户决定废弃整体签名功能 PRD，只把 `SignatureModal` 组件抽出来独立成 PRD。grilling 5 个分叉经用户确认：① 纯组件范围（原 PRD wontfix）② 自定义 SVG 画布（弃 WebView 签名库）③ onConfirm 输出纯 base64 PNG（无 data: 前缀），笔迹逻辑抽纯 reducer ④ 逐笔撤销 + 全清 + 空签名确认 disable ⑤ 纯组件不含 demo，真机验证后置集成 PRD。领域无变化（不动 CONTEXT.md/ADR）。
