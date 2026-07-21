# 导出能力管道（Export Pipeline）

Type: prd
Status: ready-for-agent

## 问题陈述

shop-note 目前没有任何导出能力——所有库存、流水、会员数据都只能看不能取出。 foreseeable 的导出需求有两类：

1. **表格导出**：把库存汇总 / 流水明细 / 每日汇总导出为 Excel，供对账、报税、外发。
2. **图片导出**：把某张库存卡 / 汇总视图截图分享给客户或留存。

这两类需求的"生成产物"步骤完全不同（xlsx bytes vs png base64），但"生成之后"的步骤完全相同：写到本地文件 → 调系统分享面板让用户保存/发送。

如果每个导出功能各自实现"落盘 + 分享 + 状态管理 + 错误处理"，会重复三份且口径漂移。本 PRD 在第一个真实导出落地之前，先**封装这条公共管道**，让后续任何格式的导出只需写一个"生成产物"函数即可挂上来。

## 解决方案

封装一个可扩展的导出管道，由三部分组成：

1. **ExportJob**：一个描述导出任务的数据结构——文件名、MIME 类型、编码、一个生成产物内容的 `build` 函数。`build` 是唯一可插拔点（xlsx/png/csv 各自实现），其余字段描述产物元信息。
2. **runExport**：执行器函数——门控分享可用性 → 调 `build` 生成内容 → 写到 `cacheDirectory` → 调 `expo-sharing` 拉起系统分享面板。吸收平台差异、用户取消不算错误。
3. **useExport**：React Query `useMutation` 包装——给 UI 暴露 `isPending`/`error`/`mutate`，调用方按钮 `disabled` 防重复。

后续加 Excel 导出：写一个纯函数 `buildSummaryWorkbook(data) → base64 string`，调 `useExport().mutate({ filename, mimeType, encoding: 'base64', build })`。加图片导出：`build` 用 `react-native-view-shot` 截图返回 base64。管道零改动。

## 用户故事

1. 作为操作者，我想未来能把库存汇总导出成 Excel 发给会计，以便对账报税。
2. 作为操作者，我想未来能把某段时间的流水明细导出成 Excel，以便外发或存档。
3. 作为操作者，我想未来能把汇总视图截图分享给客户，以便快速沟通。
4. 作为操作者，我想导出时系统弹出分享面板让我选存到哪/发给谁，而不是只能存到一个固定地方。
5. 作为操作者，我想导出过程中按钮显示加载态、不可重复点击，以便知道正在处理。
6. 作为操作者，我想分享面板被取消时不报错，以便我改主意不导出。
7. 作为操作者，我想导出失败时看到明确错误提示，以便知道哪里出了问题。
8. 作为开发者，我想加一种新导出格式时只写"生成内容"函数、不碰落盘/分享/错误处理，以便快速扩展且不引入重复代码。
9. 作为开发者，我想管道的编排逻辑有自动化测试覆盖，以便重构时有回归保护。

## 实施决策

### 依赖

- 新增 `expo-file-system` + `expo-sharing`（`npx expo install`，让 Expo 选 SDK 57 兼容版，勿裸 `pnpm add`）。
- **不**装 `xlsx`（SheetJS）/ `react-native-view-shot`——留给第一个真实导出。
- 装完必须 `expo start --clear`（[PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md) 踩坑：Metro/Hermes 缓存旧依赖图会崩）。
- `app.json` 无需改动：`expo-file-system` / `expo-sharing` 是标准 Expo 模块，不需要 config plugin，当前 `plugins`（expo-router / expo-splash-screen / expo-sqlite）不变。

### 核心抽象 — ExportJob

一个描述导出任务的数据结构（type shape，来自 grill 讨论）：

```
ExportJob {
  filename: string                              // 'shop-summary.xlsx' / 'inventory.png'
  mimeType: string                              // 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' / 'image/png' / 'text/csv'
  encoding: 'base64' | 'utf8'                   // 二进制（xlsx/png）用 base64，文本（csv）用 utf8
  build: () => string | Promise<string>         // 产物内容 —— 唯一可插拔点
  dialogTitle?: string                          // 分享面板标题（仅 Android 生效，iOS 忽略）
}
```

- **`build` 返回单一 `string` 类型**：base64 覆盖 xlsx/png，utf8 覆盖 csv。不预留 `buildToFile`（返回文件 URI）变体——foreseeable 图片导出是截图 UI 卡片 / 渲染图表类（KB~几 MB），base64 无内存压力。若未来出现批量打包 / 超长长图导致 base64 内存问题，再加 `buildToFile` 可选字段（向后兼容扩展，不破坏现有 `build` 调用方）。
- **`mimeType` 必填**：吸收平台差异（Android 某些版本必填 mimeType 才能正确分享；iOS 可选但推荐）。
- **`dialogTitle` 可选**：仅 Android 生效，iOS 忽略，保留不删。

### 执行器 — runExport

普通 async 函数，编排四步：

1. `Sharing.isAvailableAsync()` 门控——false 则 throw（分享不可用时给 UI 明确错误而非静默失败）。
2. `await job.build()` 生成内容——`build` 抛错向上传播、不吞。
3. `FileSystem.writeAsStringAsync(cacheDirectory + filename, content, { encoding })` 写到缓存目录。
4. `Sharing.shareAsync(file, { mimeType, dialogTitle })` 拉起系统分享面板。

**用户取消不算错误**：`expo-sharing` 在 iOS 用户取消分享时会 reject，错误信息含 `'User canceled'`；`runExport` 捕获并识别该情况、不 throw（取消是合法行为，不是错误）。该外部库行为需在 build 阶段以 SDK 57 文档 + 真机验证确认。

**文件留存**：**不**主动清理 cache 文件——iOS 分享面板未关闭时删文件有 crash 风险（据 expo-sharing 文档/社区反馈，待 build 阶段真机确认）；`cacheDirectory` 由系统自动清理，无需封装层介入。

**错误暴露**：`runExport` throw `Error(message)`，不引入错误分类（单操作员场景，UI 一个 `Alert` 显示 message 即可，分类是过度设计）。

### hook — useExport

`useMutation({ mutationFn: runExport })` 的薄包装，返回 `UseMutationResult<string, Error, ExportJob>`（成功时 data 为文件 URI）。

- 每个调用点独立 `useExport()`，`isPending` 时按钮 `disabled`——单操作员无高频并发，不需全局锁。
- 不参与 React Query 的 query cache（它是 mutation，不消费 query 数据；调用方在 `build` 闭包里自行用 `useStaff`/`useDailyFlow` 等 read hook 的 data）。

### 落点

- `src/export/types.ts` — `ExportJob` 类型。
- `src/export/run-export.ts` — 执行器。
- `src/export/run-export.test.ts` — 执行器测试。
- `src/hooks/use-export.ts` — `useExport` hook（与 `reads.ts` / `mutations.ts` 同列，hook 集中在 `src/hooks/` 符合现有惯例）。

管道独立于 `src/data/`（不碰 repos/SQL）和 `src/components/`（不渲染 UI），是独立的能力域。

### 不提供 format helper

封装层**不**提供金额/日期格式化 helper：

- 日期：`build` 函数直接 import 现有 `date-format.ts` 的 `formatDate`/`formatTime`/`formatDateTime`（纯函数、RN-free、node-runnable），口径天然统一。
- 金额：`money-text.tsx` 的 `cents/100` 逻辑耦合在 React 组件里、无纯函数 form。这是 money-text 的既有重构议题，**不该由导出封装背**——留给第一个真实导出顺带把 `cents→元` 抽成纯函数（放 `primitives` 或 `money-format.ts`），`build` 与 `money-text` 共用。

## 测试决策

### 测试 seam

- **现有 seams 不适用**：`StoragePort`（`src/data/port.ts`，数据层单一 seam）——`runExport` 不碰 repos/SQL；RNTL harness（`src/testing/render.tsx`，UI seam）——`runExport` 不是组件。无现成的"IO 模块编排"seam。
- **最高 seam = 直接 unit test 普通函数 + `jest.mock` 拦截 IO 模块**：`runExport` 是普通 async 函数，不需要 Provider / RNTL / InMemoryAdapter。
- **`useExport` 不单独测**：薄包装 `useMutation`，无自身逻辑，react-query 已覆盖；包装层无分支，测它价值低。

### runExport 测试

落 **data project**（`*.test.ts`, ts-jest, node env——见 `jest.config.js` 的 `dataLayerProject`）。注意：data project **不**走 jest-expo 预设、**不**自动 mock expo-*，测试文件顶部手写工厂 mock：

```
jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64", UTF8: "utf8" },
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
```

`jest.mock` 工厂**必须写在 import 之前**（ts-jest 无 `babel-plugin-jest-hoist` 的自动 hoisting——那只在 babel-jest / jest-expo 下生效；TypeScript CommonJS 输出保持源码顺序）。只要 mock 物理在 import 前，`require` 时工厂已注册、完整替代真实模块，即使真实 `expo-file-system` 在 node env 下无法 import 也不影响测试。data project 下此模式无先例（现有 `.test.ts` 均未用 `jest.mock`），build 阶段以首个测试实跑确认。

测试从 `@jest/globals` import（项目惯例，见 [codemap Validation 节点](../../../docs/codemap/project.md)：Expo `moduleDetection:force` 破坏 `@types/jest` 全局）。

断言用例：
- 正常路径：`build → writeAsStringAsync → shareAsync` 顺序调用，`filename`/`mimeType`/`encoding` 正确传递，返回文件 URI。
- 用户取消：`shareAsync` reject 含 `'User canceled'` → `runExport` 不 throw（resolves）。
- 真错误：`shareAsync` reject 不含 `'User canceled'` → `runExport` throw。
- 分享不可用：`isAvailableAsync` 返回 false → `runExport` throw，不调 `writeAsStringAsync`。
- `build` 抛错：`runExport` throw，不调 `writeAsStringAsync`。

### 未来 build 函数

纯逻辑（如 `buildSummaryWorkbook`），落 data project，用 `InMemoryAdapter` 造数据测，**不** mock IO——对应 [ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md)「纯逻辑 Jest 覆盖」那一半。

### 真机分享面板

走 device smoke（[ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md)）——分享面板真能弹起、用户取消/保存/发送的真机行为，Jest 不覆盖，推迟到第一个真实导出一起验。

### Prior art

- `mutation-queue.test.ts`：data project 纯函数测试风格（`@jest/globals`、无 React、断言调用顺序/事件序列）——`run-export.test.ts` 照此风格。

## 范围外

- **任何具体格式的 `build` 实现**（xlsx / png / csv）——留给第一个真实导出。
- **UI 入口**（导出按钮）——本 PRD 只封装管道，不接 UI。
- **`xlsx` / `react-native-view-shot` 依赖安装**——留给第一个真实导出。
- **金额纯函数 form 的重构**（money-text 抽离）——留给第一个真实导出。
- **`buildToFile` 变体**（返回文件 URI 而非内容）——YAGNI，遇到大文件再加。
- **expo-sharing 在 iOS 分享 `.xlsx` 是否需配置 UTI / infoPlist**——留给第一个真实 Excel 导出查 SDK 57 文档确认。
- **导出文件的主动清理**——不清理（iOS crash 风险 + 系统自动清理）。
- **错误分类**（区分 write-failed / sharing-unavailable / build-failed 的 typed error）——过度设计。

## 补充说明

- **关联**：[CONTEXT.md](../../../CONTEXT.md)（域语言未变，导出是技术能力非域概念，本轮不动）；[ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md)（纯逻辑 Jest + device smoke 范式，`runExport` 测试对应纯逻辑那一半，真机分享对应 device smoke）；[ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md)（UI 测试策略，本 PRD 不涉及 UI）；[PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md)（纯移动端无 Web → 不能用 Blob / `<a download>`，必须走 `expo-sharing`；装依赖后 `expo start --clear`）。
- **Expo SDK 57**：写 `runExport` 前查 https://docs.expo.dev/versions/v57.0.0/ 确认 `expo-file-system` 的 `writeAsStringAsync` / `cacheDirectory` / `EncodingType` 与 `expo-sharing` 的 `shareAsync` / `isAvailableAsync` 在 SDK 57 的签名（AGENTS.md 硬性要求）。
- **纯移动端约束**：项目无 Web 目标（[PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md)），导出不能用 Web 的 Blob / `<a download>`，必须走 `expo-sharing` 的系统分享面板。
- **本轮不预写 ADR**：管道的架构决策（单一 `build` string、不提供 format helper、不主动清理、YAGNI `buildToFile`）由本 PRD 承载 rationale；Gate 0 通过后由 /sdd-flow 决定是否提 ADR。
- **Gate 0 后由 /sdd-flow 决定是否拆 spec**：本 PRD 范围小（一个管道 + 一个 hook + 测试），可能单 spec 即可，也可能不拆 spec 直接 /tdd——由 /sdd-flow 判断。

## Comments

- 2026-07-11 — drafted via `/idea-to-prd`（`/grilling` 确认 2 个核心缺口：交付范围=纯管道 lib 不接 UI；`build` 返回单一 string 不预留 `buildToFile`。行为细节有推荐、Gate 0 可推翻）。
- 2026-07-11 — 对抗性评审 **PASS**（fresh-context general-purpose sub-agent，veracity first：16 条断言全部核验通过——jest 配置 / 模块现状 / seam 真实性 / ADR 引用 / PROJECT_KNOWLEDGE 踩坑引用均属实；方案可行、ADR 对齐、seam 成立）。fold 入 3 处 minor veracity 修正：① `jest.mock` 在 ts-jest 下无 hoisting（`babel-plugin-jest-hoist` 仅 babel-jest 生效），改为「必须写在 import 之前（CommonJS 保持源码顺序）」并标注 data project 此模式无先例、build 阶段实跑确认；② CodeMap 引用 Risk Areas → Validation 节点；③「已知 expo-sharing 行为」与「待验证」措辞矛盾，统一为「待 build 阶段真机确认」。状态 `needs-info` → `ready-for-human`，待 Gate 0。
- 2026-07-11 — Gate 0 通过（用户 reviewed PRD 文件，无修改）。状态 `ready-for-human` → `ready-for-agent`，进入 /sdd-flow 执行。
