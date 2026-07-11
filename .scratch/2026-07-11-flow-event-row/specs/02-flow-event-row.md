# FlowEventRow 单笔流水行组件

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #01

## Goal

封装可复用的单笔流水行组件，统一出库/充值列表行的布局、秒级时间与点击进入详情交互。

## Acceptance criteria

- [ ] Checkout 行展示：`formatTimeSeconds` 时间、出库标签（danger）、金额、`计 {bundles} 单`、零售金额、chevron-forward — 证明出库摘要完整
- [ ] Topup 行展示：时间、充值标签（success）、金额、chevron；无 bundle/零售文案 — 证明充值行精简
- [ ] 根节点 `Pressable` 触发 `onPress` — 证明整行可点
- [ ] 可选 `testID` 前缀生成 `${prefix}-time` 等子 ID，与 `FlowSummary` 前缀约定一致 — 证明多实例不碰撞
- [ ] 不展示商品名 — 证明列表行按 PRD 去商品化

## Scope

- **In**: 新组件 `flow-event-row.tsx` + 组件测试。
- **Out**: 父级 merge 逻辑、路由、详情页、数据查询。

## Context

- 依赖 spec #01 的 `formatTimeSeconds`
- `FlowSummary` 管区间合计；本组件管单笔，命名邻近职责不同
- `MoneyText` + `useTheme` 为现有展示惯例
- ADR-0006: RNTL 组件测试，router-agnostic（`onPress` 由父传入）

## Design

- **Interface delta**
  ```ts
  type FlowEventRowProps =
    | { kind: 'checkout'; timestamp: number; amountCents: number; bundles: number; retailCents: number; onPress: () => void; testID?: string }
    | { kind: 'topup'; timestamp: number; amountCents: number; onPress: () => void; testID?: string };
  ```
  - 导出 `FlowEventRow` 函数组件
- **Internal architecture**
  - 单行 `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 8`
  - 类型标签颜色：出库 `theme.danger`，充值 `theme.success`；时间 `theme.textSecondary`
  - bundle/retail 仅 `kind === 'checkout'` 分支渲染
  - 右侧固定 `Ionicons name="chevron-forward"`
- **Deep-module note**: 组件无数据获取；`bundles`/`retailCents` 由父级 `splitBundleRetail` 算出后传入，保持纯展示

## Rework on failure

删除 `flow-event-row.tsx` 及测试；接入 specs 等待本组件就绪。
