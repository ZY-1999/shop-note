# 管理列表「包含删除」筛选（含搜索）

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-export.md)
Blocked by: None — 可立即开始

## Goal

管理·会员 / 管理·商品默认只看有效行；顶栏「包含删除」与搜索共用同一筛选，开则可见并可恢复已删除行。

## Acceptance criteria

- [x] 默认列表不含已删除会员/商品；打开「包含删除」后出现已删除行且可恢复 —— 行为变化 + 恢复能力
- [x] 搜索 + 开关关：只命中有效；开关开：可命中已删除 —— search 尊重 includeVoided
- [x] 会员列表/搜索始终不含管理员 `-1`
- [x] 补货 / 配置段无「包含删除」控件
- [x] 既有 create/edit/void/restore 路径不回归（开关关时 void 后行消失，开时可见「已删除」+恢复）

## Scope

- **In**：`StaffRepository.search` / `ProductRepository.search` 的 `includeVoided?`；`useStaff` / `useProducts` 透传；`StaffManage` / `ProductManage` 默认 `false` + 顶栏左开关；相关单测 / RNTL。
- **Out**：导出按钮 / 管道 / xlsx；改 void/restore 语义；补货/配置。

## Context

- 父 PRD：[01-manage-export.md](../01-manage-export.md)。今日非搜索路径已 `includeVoided: true`（将改为默认 false）。
- `staff.ts` / `product.ts`：`list` 已支持 includeVoided；`search` 只扫有效。
- `reads.ts`：有 search 时忽略 includeVoided。
- `manage-tab.tsx`：已有已删除标签 + 恢复。ADR-0006 RNTL。

## Design

- **Interface delta**
  - `StaffRepository.search(q: { text?: string; includeVoided?: boolean })`：默认 false；true 时在含 voided 的集合上过滤姓名/电话（仍排除 `-1`）。
  - `ProductRepository.search(q: { text?; code?; category?; includeVoided?: boolean })`：默认 false；true 时不强制 `voided_at: null`。
  - `useStaff` / `useProducts`：有搜索文案时把 `includeVoided` 传入 search；无搜索时传入 list。
  - UI：各段列表顶栏左「包含删除」`Switch`（默认关，testID 如 `staff-include-voided` / `product-include-voided`）；状态驱动上述 hooks。
- **Deep-module note**：筛选语义集中在 repo search/list + 一处开关 state；hooks 薄透传。
- **Internal architecture**：无新模块。搜索与 list 共用同一 boolean；避免 UI 本地再滤一层导致与导出行集漂移（导出在后续 spec）。
- **Test seam**：`staff.test` / `product.test` search；`manage-tab.test` 默认隐藏 / 开关 / 搜索组合 / 无控件于补货配置。

## Rework on failure

失败隔离在筛选与 hooks；不波及导出管道。重做本 spec 即可。

## Comments

- 2026-08-04 — skeleton + design from candidate-3（judge PASS）。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] 默认隐藏 + 开关显示/恢复 — `manage-tab.test.tsx::staff: default hides voided; switch shows them; search respects the switch` + `::product: default hides voided; switch + search combination mirrors staff`
  - [x] 搜索尊重 includeVoided — `staff.test.ts::search({text, includeVoided:true}) matches voided staff…` + `product.test.ts::search({text, includeVoided:true}) matches voided products…` + 上两条 manage-tab 搜索组合
  - [x] 始终排除 `-1` — `staff.test.ts::list / listActive / search({}) / list({includeVoided:true}) all exclude '-1'`（含 `search({includeVoided:true})` / `search({text:"管理", includeVoided:true})`）
  - [x] 补货/配置无开关 — `manage-tab.test.tsx::restock / config segments have no include-voided switch`
  - [x] void/restore 不回归 — `manage-tab.test.tsx::voids a staff then restores them…` + `::voids a product then restores it…`（关→消失；开→已删除+恢复）
  - Test run: `npx jest src/data/staff.test.ts src/data/product.test.ts src/components/manage-tab.test.tsx --forceExit` → 56 passed, 0 failed
  - Commit: `526c472`
