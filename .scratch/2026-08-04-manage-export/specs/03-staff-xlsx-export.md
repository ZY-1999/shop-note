# 会员 xlsx build + 管理·会员导出

Type: spec
Status: ready-for-agent
Parent: #01 (01-manage-export.md)
Blocked by: #01, #02

## Goal

管理·会员顶栏「导出」产出与当前「包含删除」/搜索一致的 `会员-YYYYMMDD.xlsx`，经管道弹出系统分享。

## Acceptance criteria

- [ ] 纯 `build` 列固定为：姓名、电话、备注、等级（`labelForLevel`）；**当且仅当** `includeVoided===true` 时追加「状态」（有效/已删除）；关 includeVoided 时**仅有效行且无状态列**；排除 `-1`；无 id/时间戳 —— InMemory 可测
- [ ] 导出行集与当前开关+搜索一致
- [ ] 点导出触发 `useExport`；`isPending` 时按钮禁用；失败 `toast.error`；取消分享不 toast 错误
- [ ] 文件名 `会员-YYYYMMDD.xlsx`（设备本地日）
- [ ] **[手动]** 真机：分享面板 + 打开 xlsx 可读；若需 iOS UTI/`infoPlist` 已按 SDK 57 配置

## Scope

- **In**：锁定 xlsx 库；会员 workbook `build`；管理·会员顶栏右「导出」接线；iOS xlsx 分享核对/配置。
- **Out**：商品导出（#04）；改筛选语义（#01）；改管道（#02）。

## Context

- 依赖 #01 筛选状态与行集、#02 管道与（若会员表无金额列则）金额 helper 已存在供后续商品复用。
- `STAFF_LEVELS` / `labelForLevel`；`ADMIN_STAFF_ID`。
- 管理 mutation 失败用 `toast.error`。

## Design

- **Interface delta**
  - `buildStaffWorkbook(rows: Staff[], opts: { includeVoided: boolean }): string`（base64 xlsx）——或接受已过滤行 + `includeStatusColumn`；以「行集由调用方按当前列表传入」为深接口，避免 build 内再搜一次。
  - 列：姓名、电话、备注、等级；`includeVoided===true`（或行中存在 voided / 显式 flag）时追加「状态」：`有效`/`已删除`。
  - 锁定 xlsx 库（实施时选定，写入本 spec Comments）；MIME spreadsheet；`encoding: 'base64'`。
  - UI：会员顶栏右「导出」；`mutate({ filename: \`会员-${YYYYMMDD}.xlsx\`, ..., build: () => buildStaffWorkbook(currentRows, ...) })`。
- **Deep-module note**：`build` 只做表结构；筛选在 UI/hooks 已完成 —— 删除 build 内过滤则调用方负责，通过删除测试。
- **Internal architecture**：日期用现有 `date-format` 或本地日格式化；不二次请求 repo。UTI：查 SDK 57，需要则改 `app.json`。
- **Test seam**：纯 build Jest；RNTL 导出按钮 pending / toast（IO mock 在管道层或 mutate mock）。

## Rework on failure

xlsx 库或 UTI 选型失败只重做本 spec；#04 等本 spec 锁定后再开。管道与筛选不动。

## Comments

- 2026-08-04 — skeleton + design from candidate-3（judge PASS）。
