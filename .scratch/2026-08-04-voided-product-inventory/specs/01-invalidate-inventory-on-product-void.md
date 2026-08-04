# 作废/恢复商品时刷新库存聚合

Type: spec
Status: ready-for-agent
Parent: #01 (01-voided-product-inventory.md)
Blocked by: None — can start immediately

## Goal

商品作废或恢复后失效库存聚合查询，已打开汇总的 `useShopAggregate` 拿到最新 `voided_at`。

## Acceptance criteria

- [ ] `useVoidProduct` 成功后已挂载的 shopAggregate 消费者 refetch（不再吃作废前 Product）
- [ ] `useRestoreProduct` 成功后同样 refetch
- [ ] 既有 `qk.products` 失效保留；不改件数/成本派生口径

## Scope

- **In**：`useVoidProduct` / `useRestoreProduct` 的 `invalidateQueries`（对齐 `useUpdateProduct` 的 `qk.inventory.all`）+ 跨视图刷新测试。
- **Out**：库存卡红名/显隐、导出后缀（#02）。

## Context

- 父 PRD：`.scratch/2026-08-04-voided-product-inventory/01-voided-product-inventory.md`
- 今日 void/restore 只 `qk.products.all`；`useUpdateProduct` 已同时失效 `qk.inventory.all`
- Prior art：summary-tab 跨视图 refresh；manage-tab void product

## Design

- **Interface delta**
  - `useVoidProduct` / `useRestoreProduct` `onSuccess`：在既有 `qk.products.all` 外增加 `qk.inventory.all`（前缀覆盖 `shopAggregate`）。
  - **Deep-module note**：与 `useUpdateProduct` 对称；无新公共 API。
- **Internal architecture**
  - 测试：汇总挂载 + 管理页 void/restore → 库存行上的 product.voided_at / 可见状态变化可观察（可与 #02 合并测跨视图，本 spec 至少证明 invalidate 触发 refetch 后 voided_at 更新——例如展开库存卡看 title 仍在但后续 #02 才标红；或断言 query 数据）。最高 seam：RNTL 挂 SummaryTab + 调 void mutation 后 `aggregate` 行 `product.voided_at` 非 null（若 UI 尚不标红，可通过 test 直接读 queryClient 或等 #02）。本 spec 优先：manage void 后 `useShopAggregate` 数据中该 product `voided_at != null`。
- **Test seam**：hooks/mutations 或 summary+manage 集成；对齐 `useUpdateProduct` 注释中的 invalidate 模式。

## Rework on failure

失败隔离在两处 mutation 的 invalidate 行；单独重做。
