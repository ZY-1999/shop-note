# 管理·会员导入 + kind 参数化导入壳

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-import.md)
Blocked by: None — 可立即开始

## Goal

落地可复用的导入子页壳（`kind` 可扩展），并以会员为第一条垂直切片打通：顶栏入口 → 模板 → 选文件 → 预览 → 确认 bulk 新建。

## Acceptance criteria

- [x] 会员顶栏「导入」在「导出」左侧；进入导入子页且 `kind=staff`（壳可参数化，非 staff 一次性页）— 入口 + 壳契约
- [x] 可下载仅表头 `会员导入模板.xlsx`（姓名、电话、备注、等级）；经 `useExport`；取消分享非错 — 模板
- [x] 选合法 xlsx 后预览：可导入表+条数；失败底栏可展开（行号+原因）；取消选文件 / 非 xlsx 不改库、不报错 — 预览
- [x] 「确认导入 n 个会员」只写可导入行；`MutationQueue` 内顺序 create；一次 invalidate `qk.staff` + 一次成功 toast → back；中途失败一次 `toast.error`、留页、前缀保留；无 n 次「已创建」toast — bulk 约定
- [x] 姓名 trim：有效/已删除撞名失败（原因区分）；保留名/管理员同名失败；文件内重复后者失败；缺必填失败；等级空=普站、等级非法文案失败；只新建不 update/restore — 校验
- [x] **Tracer 优先**：先 happy path 闭环，再补齐失败原因与中途失败用例
- [x] 壳含可选确认区扩展点（kind 可注入确认钮上方附加 UI；staff 不用）— 供后续 restock 备注，本切片验收「扩展点存在且 staff 路径无多余控件」即可

## Scope

- **In**：kind 参数化导入路由/壳；DocumentPicker；会员模板 build；会员解析校验；`useImportStaff`；会员顶栏导入钮；相关单测/RNTL。
- **Out**：商品/补货 kind 接线（#02/#03）；改导出列；upsert/restore；CSV。

## Context

- 父 PRD：[01-manage-import.md](../01-manage-import.md)。术语：**导入 Import**、会员、管理员 `-1` — `CONTEXT.md`。
- 导出管道：`useExport` / `runExport` / `XLSX_MIME`；`xlsx@0.18.5`。
- 根 Stack 兄弟屏先例：`record-form` / `topup-form`（`_layout.tsx`）。
- `StaffRepository.list({ includeVoided: true })` 恒排除 `-1`；保留名须另检 `getById('-1')` 或固定「管理员」。
- ADR-0005 MutationQueue；ADR-0006 RNTL + 真 InMemory。
- manage-tab 会员 `filterBar` 现有导出。

## Design

- **Interface delta**
  - 导入路由接受 `kind`（本切片接线 `staff`；形状允许后续 `product`/`restock`）。
  - `buildStaffImportTemplate(): string`（base64 空表头）+ 文件名 `会员导入模板.xlsx`。
  - `previewStaffImport(rows, existingStaff[], adminName): { ok, fail }` — 纯函数/模块；existing 来自 `list({includeVoided:true})`；admin 保留名单独规则。
  - `useImportStaff()`：`mutate(okRows)` → queue 内顺序 `staff.create`；单次 invalidate + 单次 toast。
  - 壳：下载模板 / 选文件 / 预览表 / 失败可展开 / 确认文案；staff 域配置注入列与 preview/import。
  - **确认区扩展点（本切片必须落地、供 #03 复用）：** kind 配置可提供可选 `confirmExtra`（或等价 slot）——确认钮上方的附加 UI；`staff`/`product` 不使用；形状允许 `restock` 注入整批备注而不重写壳。
- **Deep-module note**：壳隐藏 picker/预览布局；校验纯函数隐藏去重规则；bulk hook 隐藏 queue+toast 策略（B/C「同 A 约定」）；确认区 slot 隐藏 kind 特异表单。
- **Internal architecture**：解析与 UI 分离；不循环 `useCreateStaff`；不嵌套跨行 `withTransaction`。
- **Test seam**：校验 InMemory/纯函数 Jest；**模板 build 表头形状 + `useExport` job 入参**（IO mock 同导出）；RNTL 入口+预览+确认（DocumentPicker/`runExport` mock）；真机手验 picker。

## Rework on failure

失败隔离在壳 + 会员切片。商品/补货未开始则只重做本 spec。

## Comments

- 2026-08-04 — skeleton + design from candidate-2（judge R2 PASS）。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] 入口 + 壳契约 — `manage-tab.test.tsx::shows 导入 left of 导出 on staff…` + `import-form.test.tsx::downloads template…`（`kind=staff`；`confirmExtra` 默认无）
  - [x] 模板 — `build-staff-import-template.test.ts::emits header-only…` + `import-form.test.tsx::downloads template via useExport…`（`会员导入模板.xlsx`）
  - [x] 预览 — `import-form.test.tsx::downloads template…` + `::cancel pick and non-xlsx…` + `::shows expandable failures…`
  - [x] bulk 约定 — `import-form.test.tsx::downloads template…`（单次 toast / back）+ `::mid-fail…`（前缀保留 + toast.error）
  - [x] 校验 — `preview-staff-import.test.ts` happy + validation failures；`parse-staff-import-workbook.test.ts`
  - [x] Tracer — happy path 先于失败用例（同上）
  - [x] confirmExtra — `import-form.test.tsx::shows expandable failures; confirmExtra slot…`（注入可见；staff 默认无控件）
  - Test run: `npx jest src/import/ src/components/import-form.test.tsx src/components/manage-tab.test.tsx src/export/ --forceExit` → 78 passed, 0 failed
  - Commit: `0687f6f`
  - Dep: `expo-document-picker@~57.0.1`；写盘仍 `expo-file-system/legacy`
  - **待真机**：DocumentPicker 选文件 + 模板分享手验
