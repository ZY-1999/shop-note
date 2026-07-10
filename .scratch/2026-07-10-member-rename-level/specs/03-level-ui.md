# 会员等级 UI — 管理表单等级选择器 + 列表/详情等级徽标

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-10 — awaits Stage 3 review
Parent: #01
Blocked by: #01 (level-data-foundation) # 需 Staff.level 字段 + STAFF_LEVELS 注册表

## Goal

在会员管理表单（创建+编辑）提供一个等级选择器（普站/金站，手动修改），并在管理列表行、记账首页 staff-row、会员详情头部展示等级徽标（金站醒目）——消费 spec #01 提供的 `Staff.level` 与 `STAFF_LEVELS`。

## Acceptance criteria

- [ ] 管理页 `StaffForm`（创建模式）渲染等级选择器，默认选中「普站」—— 证明创建可选等级、默认普站。 *(manage-tab.test.tsx)*
- [ ] 创建会员选「金站」保存 → 列表回到该行、行内显示金站徽标；回读 `level==='gold'`（经 useCreateStaff）—— 证明选择器落库 + 徽标渲染。 *(manage-tab.test.tsx)*
- [ ] 编辑模式：点已有会员进 `StaffForm`，选择器回填其当前等级；改等级保存 → 徽标更新（经 useUpdateStaff patch.level）—— 证明等级可手动改（满足"手动修改"核心诉求）。 *(manage-tab.test.tsx)*
- [ ] 管理列表行：金站会员显示醒目徽标（普站省略或弱化——spec 定，建议金站-only 徽标）—— 证明列表可见等级。 *(manage-tab.test.tsx)*
- [ ] 记账首页 `staff-row`：显示等级徽标（与排序语义一致：金站排前且可见）—— 证明记账列表可见等级。 *(staff-row.test.tsx)*
- [ ] 会员详情 `staff-detail` 头部：展示当前等级徽标（只读，无编辑入口）—— 证明详情可见等级 + 详情页不承担编辑。 *(staff-detail.test.tsx)*
- [ ] 等级展示文案来自单一注册表 `STAFF_LEVELS`（`labelForLevel`），UI 不硬编码「普站/金站」字面—— 证明与 #01 单源一致。 *(代码检视/测试)*
- [ ] 既有能力不回归（搜索/入库/出单/编辑/作废/欠货标识/审计）—— 既有测试绿。 *(全量 jest)*
- [ ] **[手动 / 边界]** 暗色模式 / 徽标配色 / 选择器手感视觉正确（金站徽标在明暗主题下均醒目）—— 承载 PRD 测试决策边界（ADR-0006，RNTL 不覆盖，留手动）。 *(人检)*

## Scope

- **In**: `src/components/manage-tab.tsx`（`StaffForm` 加等级选择器字段、`StaffManage` 行加徽标）、`src/components/staff-row.tsx`（徽标）、`src/components/staff-detail.tsx`（头部徽标）；对应测试 `manage-tab.test.tsx`、`staff-row.test.tsx`、`staff-detail.test.tsx`。
- **Out**: 等级数据层（字段/注册表/排序/迁移 = #01）；新增 mutation 或 query key（复用既有 `useCreateStaff`/`useUpdateStaff`，patch 随 #01 放宽，失效键仍是 `qk.staff`）；「员工→会员」改名（#02，建议先于本 spec 落地）；超过两档等级、等级自动规则、等级权限/价格差异化。

## Context

- 依赖 spec #01：`Staff.level`、`STAFF_LEVELS`（`labelForLevel`）、`StaffCreateInput.level?`、`StaffUpdatePatch.level?`。
- [ADR-0005](../../../../docs/adr/0005-ui-layer-architecture.md) UI 层架构 + [ADR-0006](../../../../docs/adr/0006-ui-component-testing-rntl.md)（RNTL + 真实 `InMemoryAdapter`，行为驱动）。
- 编辑面现状：`StaffForm`（[manage-tab.tsx](../../../../src/components/manage-tab.tsx)）是唯一会员字段编辑处（创建+编辑 name/phone/notes，预填 + `useCreateStaff`/`useUpdateStaff` 提交）；`staff-detail`（[staff-detail.tsx](../../../../src/components/staff-detail.tsx)）只读（库存卡 + 按天历史），不承担编辑——故等级选择器放 `StaffForm`，详情仅徽标。
- 既有视觉语汇：`manage-tab.tsx` 已有 staff/product 的 segments（`Pressable` + `styles.segments`，选中态 `backgroundSelected`）——等级选择器可复用该两段式 segments 样式，保持一致（控件选型见 Design）。
- 数据流：`useCreateStaff`/`useUpdateStaff` 入参类型随 #01 自动放宽（`level?`），失效 `qk.staff.all` → 列表/行自动刷新，无需新 key 或调用方 refetch。
- 与 #02（改名）的共享面**仅 `manage-tab.tsx`**（`staff-row.tsx`/`staff-detail.tsx` 无「员工」串，#02 不触它们）：建议 #02 先落地，本 spec 直接在已改名的 `manage-tab.tsx` 写「会员」；非功能性依赖——两 spec 在 `manage-tab.tsx` 改的是不同 JSX 区域（纯文本 vs 新字段+徽标），不冲突。

## Design

- **Interface delta** — 无数据层变化（消费 #01）。UI 内部：`StaffForm` 增一个等级字段（受控 state，默认 `DEFAULT_STAFF_LEVEL`='normal'；编辑模式在既有 preload 里回填 `s.level`）；提交 payload 随既有 `useCreateStaff({...,level})` / `useUpdateStaff({patch:{...,level}})`，无新 mutation。徽标为纯展示组件（入参 `level: StaffLevel`，渲染 `labelForLevel(level)` + 配色）。
- **控件选型**（spec 锁定其一）：(a) 复用 `manage-tab` 既有 segments 样式（两段 Pressable：普站/金站，选中态高亮）——零新依赖、与现有视觉一致，**推荐**；(b) `@expo/ui` `SegmentedControl`——若偏好原生控件，先查 Expo SDK 57 文档（https://docs.expo.dev/versions/v57.0.0/）。两者都满足"两档手动选"。
- **徽标设计**：金站醒目（建议 `theme.accent`/success 配色 + 「金站」字样）；普站建议**省略**（默认等级，无徽标 = 普站，避免列表噪音）——spec 确认。徽标文案一律走 `labelForLevel`，不硬编码。
- **Internal architecture** — 无新模块边界；选择器是 `StaffForm` 内一个受控字段（React Compiler 下一个 state 一个 hook），徽标是小组件/内联 `Text`。`staff-row`/`staff-detail` 各加一处徽标渲染。落点：管理表单（选择器）、管理行 + staff-row + staff-detail 头部（徽标）。
- **测试 seam**：复用既有 RNTL harness（`renderWithProviders` + 真实 `InMemoryAdapter`，ADR-0006）——驱动「创建选金站→保存→列表见徽标」「编辑改等级→徽标更新」。

## Rework on failure

失败隔离到 UI 组件。若选择器控件不合适（如 `@expo/ui` 在 SDK 57 行为异常），切回 segments 样式，仅改 `StaffForm`；徽标为独立展示，可单独调整。数据层（#01）不受影响。

## Comments

- 2026-07-10 — implemented via `/tdd`（2 个垂直 chunk：选择器+表单+管理行徽标 → staff-row+staff-detail 徽标）。新增共享展示组件 `src/components/level-badge.tsx`（金站显示 `labelForLevel` 文案、普站返回 null，单源不硬编码）。
- AC → 测试：
  - 选择器默认普站 + 可选 — `manage-tab.test.tsx::create form has a level selector...`
  - 选金站创建 → 落库 gold + 行内金站徽标 — `::picking 金站 creates a 金站 member and shows the 金站 badge in the list`
  - 编辑回填（金站未动保存仍金站）— `::edit form preloads the member's level...`
  - 管理行徽标 — 同「picking 金站」断言行内「金站」
  - 记账 `staff-row` 徽标（金站显示、普站无）— `staff-row.test.tsx::shows the 金站 badge for a gold member; no badge for a 普站 member`
  - 会员详情头徽标（只读）— `staff-detail.test.tsx::shows the 金站 badge next to the name for a gold member`
  - 标签走 `labelForLevel` 单源 — `level-badge.tsx` 用 `labelForLevel`，不硬编码「普站/金站」（代码检视）
  - 非回归 — 全量 216 passed
  - **[手动/边界]** 暗色模式 / 徽标配色（accent）/ 选择器手感 — 未由 /tdd 跑（ADR-0006，留手验）
- 控件采用复用 manage-tab segments 样式（两段 Pressable + backgroundSelected 选中态），未引入 `@expo/ui`；等级选项按 rank 升序（普站/金站）渲染，文案来自 `STAFF_LEVELS`。
- Test run: `npx jest --colors=false --forceExit` → 216 passed, 0 failed（28 suites）；`npx tsc --noEmit` clean。
