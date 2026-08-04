# Android 导入读文件沙箱回归

Type: spec
Status: ready-for-agent
Parent: #02
Blocked by: None — can start immediately

## Goal

固化 Expo Go 下选 xlsx 的可读路径（作用域外 uri → 拷入体验 cache → 再读），并用回归测锁住，防止 `isn't readable` 回退。

## Acceptance criteria

- [ ] DocumentPicker 返回 `content://`（或不在体验 `cacheDirectory` 前缀下的 uri）时，先 `copyAsync` 到作用域 cache，再对该目标 `readAsStringAsync`，预览出现且无 `isn't readable` toast — 锁住沙箱修法
- [ ] uri 已在体验 `cacheDirectory` 下时不调用 `copyAsync`（短路），预览仍正常 — 避免多余拷贝
- [ ] `expo-file-system/legacy` 测试 mock 提供 `copyAsync`；上述两路径有自动化测且通过 — 回归可机跑
- [ ] 无残留 `[DEBUG-…]` 诊断日志 — 诊断收尾
- [ ] **待真机**：Android Expo Go 管理→导入子页选合法 xlsx 可进入预览 — 关闭本 spec 前手验

## Scope

- **In**: ImportForm 选文件读路径；legacy FS mock；ImportForm 相关回归测。
- **Out**: 模板示例；补货顶栏；parse/preview/写入语义；预览长字段样式；非 xlsx；iOS 专属选取器问题。

## Context

- 父 bug `#02`（`02-manage-import-smoke.md`）Root Cause #1；诊断已确认。
- 工作树可能已含探针修法——本 spec **锁住既有修法** + 测，而非重新发现。
- 导出管道仍用 legacy `cacheDirectory` 写盘（PROJECT_KNOWLEDGE / manage-export）。
- 既有：`ImportForm` 组件测（DocumentPicker + legacy mock）；`docs/agents/git-contract.md`。

## Design

- **Interface delta**
  - ImportForm 选文件读路径行为契约（对外可测）：
    1. `getDocumentAsync({ copyToCacheDirectory: false, … })`
    2. 若 `asset.uri` 为 `content://` **或** 不以体验 `cacheDirectory` 为前缀 → `copyAsync({ from: asset.uri, to: \`${cacheDirectory}import-<unique>.xlsx\` })`，再对 `to` 做 `readAsStringAsync(…, Base64)`
    3. 否则直接对 `asset.uri` 读，**不**调用 `copyAsync`
  - 其后 parse → preview → setState 不变。
  - 测试 mock：`expo-file-system/legacy` 导出 `copyAsync`（与现有 `readAsStringAsync` / `cacheDirectory` 并列）。
  - **Deep-module note**：无新模块；在既有 ImportForm 读路径上加深「可读 uri」不变量，表面仍是选文件 → 预览。

- **Internal architecture**
  - 唯一测试缝：ImportForm RNTL（mock DocumentPicker + legacy FS）。不新开 helper 除非测迫使抽取。
  - 工作树若已有修法：对齐上述契约、补测、清 DEBUG；勿改 parse/preview。

## Rework on failure

failure is isolated; redo this spec only（回退读路径改动与相关测）。
