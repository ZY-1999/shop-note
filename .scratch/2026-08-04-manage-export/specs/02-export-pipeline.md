# 公共导出管道 + 金额纯函数

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-export.md)
Blocked by: None — 可与 #01 并行

## Goal

落地可复用写盘+系统分享管道，并抽出 `cents → 元` 纯函数，供后续 xlsx `build` 使用。

## Acceptance criteria

- [x] `runExport` 正常路径：`build` → 写 cache → `shareAsync`，返回文件 URI；filename/mimeType/encoding 正确传递
- [x] 用户取消分享（错误信息含 `User canceled`）不 throw
- [x] **真错误**：`shareAsync` reject 且信息**不含** `User canceled` → `runExport` throw
- [x] 分享不可用 / `build` 抛错 → throw，且不写盘；写盘失败 → throw
- [x] `useExport` 为 `useMutation({ mutationFn: runExport })`，暴露 `mutate` / `isPending` / `error`
- [x] 金额纯函数：整数分 → 元、两位小数；无 React 依赖
- [x] `MoneyText` 的数字部分改为调用该纯函数（`¥` / 颜色 / `negativeLabel` 仍在组件内）——与导出共用单源

## Scope

- **In**：`ExportJob` 类型、`runExport`、`useExport`；`expo-file-system` + `expo-sharing` 安装；金额 format 纯函数 + `MoneyText` 改用；管道单测。
- **Out**：任何业务 `build`、管理 UI、xlsx 库、iOS UTI 配置。

## Context

- 吸收 [export-pipeline PRD](../../2026-07-11-export-pipeline/01-export-pipeline.md)（已 wontfix，由本 feature 承接）。
- PROJECT_KNOWLEDGE：纯移动端；装依赖后 `expo start --clear`。
- ADR-0004：纯逻辑 Jest；真机分享留给后续真实导出。
- Expo SDK 57：默认 `expo-file-system` 入口上旧 `writeAsStringAsync` / `cacheDirectory` **会 runtime throw**（Deprecated）。本 spec **钉死**写盘走 `expo-file-system/legacy`（保留 `cacheDirectory` + `writeAsStringAsync` + `EncodingType`），Jest mock 同路径；不在本轮改用新 `File`/`Paths` API（可后续迁移）。
- `MoneyText` 今日内联 `/100`；本轮改为调用纯函数。
- Expo Sharing：核对 `shareAsync` / `isAvailableAsync` 签名。

## Design

- **Interface delta**
  ```
  ExportJob {
    filename: string
    mimeType: string
    encoding: 'base64' | 'utf8'
    build: () => string | Promise<string>
    dialogTitle?: string
  }
  runExport(job: ExportJob): Promise<string>  // 文件 URI
  useExport(): UseMutationResult<string, Error, ExportJob>
  formatCentsAsYuan(cents: number): string    // 两位小数，如 "3.00"
  // MoneyText 数字展示改调 formatCentsAsYuan（非新导出 API）
  ```
- **Deep-module note**：`runExport` 小接口隐藏可用性门控、编码写盘、取消识别；`formatCentsAsYuan` 单源 — `MoneyText` 与 xlsx build 共用，避免双路径漂移。
- **Internal architecture**：管道独立于 `src/data` 与 UI（如 `src/export/` + `src/hooks/use-export.ts`）；**仅从 `expo-file-system/legacy` import 写盘 API**；不主动清理 cache；取消分享吞掉、其它错误（含非取消的 share 失败）上抛。
- **Test seam**：data project + `jest.mock('expo-file-system/legacy')` 与 `jest.mock('expo-sharing')`（**物理写在 import 前**）；覆盖正常 / 取消 / **真错误** / 不可用 / build 错 / 写盘错。`useExport` 不单测。`MoneyText` / `formatCentsAsYuan` 单测覆盖共用。

## Rework on failure

失败隔离在管道与金额 helper。若 SDK 57 API 签名漂移，只改本 spec 适配层。

## Comments

- 2026-08-04 — skeleton + design from candidate-3（judge PASS）。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] 正常路径 — `run-export.test.ts::builds, writes cache, shares, and returns the file URI`
  - [x] 用户取消 — `::does not throw when the user cancels sharing`
  - [x] 真错误 — `::rethrows when shareAsync rejects without User canceled`
  - [x] 不可用 / build 错 / 写盘失败 — `::throws when sharing is unavailable…` / `::propagates build errors…` / `::throws when writing the cache file fails`
  - [x] `useExport` — `src/hooks/use-export.ts`（`useMutation({ mutationFn: runExport })`；不单测）
  - [x] `formatCentsAsYuan` — `format-cents-as-yuan.test.ts::formats integer 分 as 元…` (+ signed)
  - [x] `MoneyText` 改调纯函数 — `money-text.test.tsx`（既有 3 条仍 GREEN）+ `money-text.tsx` import
  - Test run: `npx jest src/export/run-export.test.ts src/lib/format-cents-as-yuan.test.ts src/components/money-text.test.tsx --forceExit` → 11 passed, 0 failed
  - Commit: `c8241a1`
