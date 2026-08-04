# 商品选择器：已选行间距收紧

Type: spec
Status: ready-for-agent
Parent: #01 (01-summary-export-polish.md)
Blocked by: None — can start immediately

## Goal

共享商品选择器已选多行间距适当缩小，补货（及共用的记账出库）更紧凑。

## Acceptance criteria

- [ ] 已选商品行之间垂直间距小于收紧前约定旧值（落到约定新值，如 8→4）
- [ ] 补货与记账出库共用该密度（全局收紧，无 density 分叉）
- [ ] 不改 chip 区、合计行、步进器内部 gap

## Scope

- **In**：ItemsSelector 已选行垂直间距样式 + 样式回归测试。
- **Out**：补货/出库业务逻辑；仅补货分叉 density；全面 UI redesign。

## Context

- 组件：`ItemsSelector`（补货 RestockManage + 记账出库共用）。
- 今日行间距主要为已选行上 `marginTop: 8`。

## Design

- **Interface delta**
  - 将已选行容器垂直间距从 `marginTop: 8` 调整为约定更小值（**4**）；不新增 props。
  - **Deep-module note**：单点样式常量，两入口同变。
- **Internal architecture**
  - 不改 chips / totalRow / stepper 的 gap。
- **Test seam**：新建或扩展组件级测试，断言 line 样式 `marginTop === 4`（或导出可测的 style）；prior art：summary-tab toolbar compact gap 断言。

## Rework on failure

失败隔离在 ItemsSelector 样式；单独重做。
