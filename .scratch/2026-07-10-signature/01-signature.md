# 出入库表单签名功能（Stock Record Signature）

Type: prd
Status: wontfix

> ⚠️ **已废弃（2026-07-11）**：整个"出入库表单签名功能"PRD 作废，不再执行。仅其中 `SignatureModal` 签名弹窗组件被抽离为独立的纯组件 PRD，见 [../2026-07-11-signature-modal/01-signature-modal.md](../2026-07-11-signature-modal/01-signature-modal.md)。下方内容仅作历史设计参考。

## 问题陈述

出库/入库记录目前只有文字信息（商品行 + 金额 + 备注 + 时间），**没有经手人/确认人的手写签名留痕**。实际店铺场景里，出单（货出店）尤其需要一张可追溯的签字凭证。本 PRD 给出库入库表单增加一个**选填**的手写签名：点击入口 → 全屏横向签名 → 撤销最后一笔 / 清除重画 → 确认 → 回表单看到缩略图 → 提交后以 PNG 文件持久落盘，记录只存路径；任何时候可重新签名覆盖。

出库/入库表单即 [record-form.tsx](../../../src/components/record-form.tsx)（CREATE 从记账行入库/出单按钮进入；EDIT 嵌在 [record-detail.tsx](../../../src/components/record-detail.tsx) 复用同一表单）。

## 解决方案

三条分叉经用户确认：

1. **选填**：`signature_path` 可空，**不签名也可提交**（保留现有快速记账流，签名是增强）。
2. **全屏 Modal 横向画布**（不锁设备方向）：签名以横向全屏 Modal 呈现（宽 > 高的签字区），不引入 `expo-screen-orientation`。设备保持竖屏，仅签名画布横向铺开。
3. **`react-native-signature-canvas`**（WebView 内嵌，自带撤销/清除/确认，确认回传 base64 PNG）+ **`expo-file-system`**（base64 写 PNG 到 app `documentDirectory`）。

配套设计：

- **数据模型**：`stock_record` 加 nullable 列 `signature_path`（一条版本化 DDL 迁移 + `SCHEMA` 注册表 + 实体接口 + create/update 输入同步）。记录只存**文件路径**，不存图片二进制。
- **文件生命周期归 UI 层**：数据层（repo / StoragePort）保持纯、不碰文件 I/O。签名 Modal 确认时只回传 **base64**（内存）；表单持有 base64 作预览；**提交时才写文件**拿路径并入 payload（取消表单不产生孤儿 PNG）。重签/删签时，旧文件在 **mutation `onSuccess` 之后**删除（失败不删，保留旧文件）。
- **重签**：CREATE 已签名 → 表单显示缩略图 + "重新签名"（覆盖）；EDIT 模式从记录预填 `signature_path` 显示缩略图，同样可"重新签名"覆盖或"删除签名"。
- **作废**：作废记录**保留**签名文件（遵守"无硬删"不变式）；签名变更属 `edit`，纳入审计 diff。
- **回显**：[record-detail.tsx](../../../src/components/record-detail.tsx) 用 `expo-image` 展示签名图片。

## 用户故事

1. 作为操作者，我想在出单/入库表单点"签名"进入横向签名，撤销最后一笔或清除重画，确认后回到表单看到签名缩略图，以便留痕。
2. 作为操作者，我想**不签名也能直接提交**（签名非强制），以免拖慢日常记账。
3. 作为操作者，我想签名后还能"重新签名"覆盖、或"删除签名"，以便改正。
4. 作为操作者，我想编辑一条已签名记录时能看到原签名、并可重新签名或删除，以便修正历史凭证。
5. 作为操作者，我想在记录详情页看到这条记录的签名图片，以便核对。
6. 作为操作者，我想作废的记录其签名仍可见（保留凭证），不丢失。
7. （隐含）签名 PNG 随 app 私有目录持久化；app 卸载随之消失（本地优先、无云端）。

## 实施决策

### 数据层（[src/data/](../../../src/data/)）

- `StockRecord` 实体加 `signature_path: string | null`（[stock-record.ts](../../../src/data/stock-record.ts)）。
- `StockRecordCreateInput` 加 `signature_path?: string`（默认 null）。
- `StockRecordUpdatePatch` 加 `signature_path?: string | null`（重签传新路径；删签传 `null`）。
- [sql-logic.ts](../../../src/data/sql-logic.ts) `SCHEMA.stock_record.columns` 末尾加 `"signature_path"`（`assertKnownKeys` 自动覆盖新列；INSERT 列序由注册表驱动，自动对齐）。
- **版本化迁移**：[expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts) 新增一版 `ALTER TABLE stock_record ADD COLUMN signature_path TEXT`（旧库升级后该列为 NULL）。
- **审计**：[auditableRecord()](../../../src/data/stock-record.ts) 投影加 `signature_path` 字段，使 EDIT 时的签名变更/清除进入字段级 diff。**注意口径**：`create` 仍不审计（既有不变量），即 CREATE 时第一次落下的签名不产生审计条目；只有 EDIT 时的签名**变更**才审计。

### UI 层（[src/components/](../../../src/components/)）

- **新组件 `SignatureModal`**：全屏 `<Modal>` + `react-native-signature-canvas`，横向布局（签字区宽 > 高）；按钮：撤销（逐笔）、清除、确认、取消；主题色经 `webStyle` 注入（笔画色 = `theme.text` 反色取对比、确认/取消用 `theme.success`/`theme.danger`）。`onConfirm(base64)`、`onCancel()`。**router-agnostic**（受控组件，不新开路由，保 RNTL 可测）。
- **[record-form.tsx](../../../src/components/record-form.tsx)**：
  - 新增本地 state `signatureDraft`：`{ kind: 'base64'; value: string } | { kind: 'path'; value: string } | null`。
    - CREATE 初始为 `null`；EDIT 初始为 `record.signature_path ? {kind:'path', value} : null`。
    - 签名确认 → `signatureDraft = {kind:'base64', value}`；缩略图用 base64（`expo-image` 支持 `data:` URI）或既有 path 直接展示。
  - 入口区：未签名 → "签名"按钮；已签名 → 缩略图 + "重新签名" + "删除签名"（删除 → `signatureDraft = null`，但 EDIT 需记下"原本有 path 要在提交后删文件"）。
  - 提交时（`submit()`）：
    - CREATE：若 `signatureDraft?.kind === 'base64'` → 写文件拿 path → payload `signature_path = path`；否则 `signature_path` 省略（null）。
    - EDIT：若 draft 是 base64 → 写新文件拿 newPath → patch `signature_path = newPath`；mutation `onSuccess` 删除旧 path 文件（若有）；若 draft 被清空且原本有 path → patch `signature_path = null`；`onSuccess` 删除旧文件。
  - 文件写入/删除走一个轻量 `src/components/`（或 `src/hooks/`）helper，封装 `expo-file-system`，便于在 RNTL 里 mock。
- **[record-detail.tsx](../../../src/components/record-detail.tsx)**：详情头部区（作废标志附近）用 `expo-image` 展示 `record.signature_path`（有则显示）；图片缺失/加载失败优雅降级（占位文案"签名缺失"，不崩）。

### 数据流（[src/hooks/](../../../src/hooks/)）

- `useCreateStockRecord` / `useUpdateStockRecord` 的 payload 类型加 `signature_path`；`mutationFn` → repo.create/update（透传新字段）；invalidate 家族不变（`qk.records` / `qk.inventory` / `qk.dailyFlow`）。
- 读侧：`useStockRecordById` 已返回完整 record（新列随 `findById` 自动带回），**无需改 read hook**；`RecordWithItems.record` 类型自动含新字段。

### 依赖

- `npx expo install expo-file-system`（Expo 核心模块，SDK 57 兼容；**spec 阶段查 https://docs.expo.dev/versions/v57.0.0/ 核验 `writeAsStringAsync(path, base64, { encoding: EncodingType.Base64 })` + `documentDirectory` + `deleteAsync` API**）。
- `pnpm add react-native-signature-canvas`（社区库，WebView，无原生编译，Expo Go 可用）。**spec 阶段必须验证与 React 19.2 / RN 0.86 / Expo SDK 57 的兼容**（peer dep、`onOK` 回调签名、撤销/清除 API、base64 是否带 `data:` 前缀）。**若不兼容 → 回退方案**：自定义画布（`react-native-svg` + 已装的 `react-native-gesture-handler` + `react-native-view-shot` 光栅化），逐笔撤销语义自管。
- 装完按 [PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md) 规则 **`expo start --clear`**（增删依赖必须清 Metro/Hermes 缓存）。

## 测试决策

沿用 [ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md)：RNTL + 真实 `InMemoryAdapter`，用户行为驱动，不 mock Repos。

- **数据层 → Jest（node，ts-jest）**：
  - `create` 带 `signature_path` 的存储与 `getById`/`list` 回读（InMemoryAdapter，`SCHEMA.stock_record` 已含新列，列序对齐）。
  - `update` 改 `signature_path`（重签）/ 置 `null`（删签）后回读正确；审计 diff **含** `signature_path` 变更（EDIT 才审计）；`create` 仍不产生审计条目。
  - 迁移纯逻辑（若有可抽纯函数：新版本号 + DDL 文本）——真实 `ALTER TABLE` 由 device smoke 覆盖。
- **UI → RNTL（jest-expo）**：
  - record-form CREATE：未签名有"签名"入口；mock `SignatureModal` 确认回 base64 后出现缩略图 + "重新签名" + "删除签名"；提交 payload `signature_path` 为写出的路径（mock file-system helper）；不签名提交 `signature_path` 为空。
  - record-form EDIT：预填签名缩略图；重新签名后提交 patch 带新路径 + `onSuccess` 删旧文件（spy）；删除签名后 patch `signature_path: null` + 删旧文件。
  - record-detail：有 `signature_path` 时渲染签名图片（mock `expo-image`）；作废记录仍显示签名。
- **边界（RNTL 不覆盖，同 ADR-0006）**：真实 `expo-file-system` 落盘/删除、真实签名画布手感/WebView 渲染、暗色模式 → 设备/手动。真实 SQL 迁移（`ALTER TABLE` 加列、旧库升级）→ 管理 tab device smoke（ADR-0004）。

## 范围外

- **锁屏横屏**（`expo-screen-orientation`）——本期用全屏 Modal 横向画布替代；若后续要真机旋转再议。
- 签名图片导出/分享/打印、上传云端（无后端）。
- 多签名（每条记录只一张）。
- 签名时间戳/防伪/数字水印/笔迹压感。
- 签名**必填**校验（本期选填；未来若要出单强制签字再加）。
- 自定义笔粗细/颜色（用 lib 默认 + 主题对比色）。
- 数据层契约重构或新派生读模型——仅给 `stock_record` 加一列 + 透传。

## 补充说明

- **关联**：[UI PRD](../2026-07-09-shop-management-ui/01-shop-management-ui.md)（首批 UI）、[ADR-0005](../../../docs/adr/0005-ui-layer-architecture.md) UI 层架构、[ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md) UI 组件测试、[ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md) device smoke、[CONTEXT.md](../../../CONTEXT.md)（需补"签名"术语条目）。
- **Expo SDK 57**：spec 阶段查 https://docs.expo.dev/versions/v57.0.0/ 核验 `expo-file-system` API；社区库 `react-native-signature-canvas` 的兼容性是首要风险（见上"依赖"回退方案）。
- **本地优先**：签名 PNG 在 app 私有 `documentDirectory`，随 app 卸载消失；DB 里 `signature_path` 可能残留为"已无文件"的路径（属"无硬删"边界）——回显必须对加载失败优雅降级（占位文案），不崩、不阻断。
- **React Compiler 已开启**：新增 `signatureDraft` state 遵循 rules-of-react（一个 state 一个用途）；文件 helper 副作用集中在提交回调。
- **spec 阶段待定（非阻塞）**：(a) 文件命名约定（如 `signatures/<recordId|uuid>.png`）；CREATE 尚无 recordId 时用 uuid 命名；(b) 图片缺失/加载失败的占位文案与样式；(c) Modal 横向画布的宽高比与撤销/清除/确认/取消按钮布局（是否分上下栏）；(d) 缩略图展示尺寸、"删除签名"是否二次确认；(e) `signature_path` 存绝对路径（`documentDirectory` 全路径）vs 相对路径约定（建议绝对，`expo-file-system` + `expo-image` 都吃绝对路径）；(f) base64 是否带 `data:image/png;base64,` 前缀的归一化（写文件前剥离）。spec 锁定。
- **可能的 spec 拆分**（to-spec 决定，依赖序）：#01 数据层（列 + 迁移 + 实体/输入 + 审计投影，纯 Jest）；#02 签名捕获 + 落盘 + record-form 集成（CREATE/EDIT/重签/删签/缩略图）；#03 record-detail 回显 + 图片缺失降级。
- **git 语义**：本 PRD 写入 `.scratch/2026-07-10-signature/01-signature.md`，**未提交**——Gate 0 通过后由 `/sdd-flow` 入口提交（与后续 CONTEXT.md "签名"术语条目一起）。
- 涉及文件：[stock-record.ts](../../../src/data/stock-record.ts)、[sql-logic.ts](../../../src/data/sql-logic.ts)、[expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts)、[record-form.tsx](../../../src/components/record-form.tsx)、[record-detail.tsx](../../../src/components/record-detail.tsx)、[reads.ts](../../../src/hooks/reads.ts) / [mutations.ts](../../../src/hooks/mutations.ts)（payload 类型）、新增 `components/SignatureModal.tsx` + 文件 helper、各对应 `.test.tsx` / `.test.ts`。

## Comments

- 2026-07-10 — 在 `/sdd-flow` 内压缩 grill 起草（用户从 `/route` 进入）。3 个分叉经用户确认：① 选填 ② 全屏 Modal 横向画布（不锁屏、零新方向依赖）③ `react-native-signature-canvas` + `expo-file-system`。设计上优化了文件生命周期：Modal 只回传 base64、提交时才落盘，避免孤儿文件；旧文件在 mutation `onSuccess` 后删除。PRD 内对现有代码的全部断言（`StockRecord` 字段集 / `SCHEMA.stock_record` 列 / `create` 不审计·`update`/`void` 审计 / `auditableRecord()` 投影 / `record-form` CREATE·EDIT 提交 payload / `package.json` 依赖现状：已装 `gesture-handler`+`expo-image`、未装 `file-system`/`svg`/`screen-orientation`）均经本次直接读源码核验。状态 `needs-info` → `ready-for-human`，待 Gate 0。
- 2026-07-10 — **Gate 0 通过**（用户 reviewed，未要求对抗性复核）。状态 `ready-for-human` → `ready-for-agent`，进入 `/sdd-flow` 执行；本入口 commit 提交 PRD；下一步 `/to-spec` 拆分 specs。
- 2026-07-11 — **废弃**（用户决定）。整个签名功能 PRD 作废；`SignatureModal` 组件抽离为独立纯组件 PRD（`2026-07-11-signature-modal`）走 `/idea-to-prd` 重做。状态 `ready-for-agent` → `wontfix`，文件保留供追溯。
