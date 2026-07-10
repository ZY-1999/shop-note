# ADR-0007: 列表「分批获取」= UI 级分批渲染，非数据层查询分页

- Status: **Accepted** (2026-07-10)
- Scope: shop-note UI 层 —— 长列表（员工详情按天历史、汇总按天×员工流水）的"分批获取"策略

## Context

页面优化重构（2026-07-10 PRD）要求员工详情的记录栏、汇总页的流水栏「按天倒序 + 支持分批获取」。shop-note 是本地优先、离线、单操作员 app：数据全本地、无网络、无后端。数据层（`StockRecordRepository.list` / `DailyFlow.flow`）目前一次性返回全部记录，**无 limit/offset**。

「分批获取」有两种解读：

- **(A) UI 级分批渲染**：单次查询仍取全量（已在内存），用 `FlatList.onEndReached` 每批渲染 N 条 / N 日，首屏只渲染首批。
- **(B) 数据层查询分页**：给 `list` / `flow` 加 `limit/offset` 或游标。

系统 PRD 的 NFR 是「约 1000 商品与记录增长下」仍流畅——记录量在数千量级、本地内存内。

## Decision

**用 (A) UI 级分批渲染。不引入数据层 `limit/offset`。**

1. 长列表（员工详情按天历史、汇总按天×员工流水）用 `FlatList`，`onEndReached` 触底时 reveal 下一批（按**日**分批，每批若干整日），首屏只渲染首批若干日。
2. 数据仍由现有单次查询（`useStockRecords` / `useDailyFlow`）全量取回；分批只发生在渲染层。
3. 天分组与倒序在派生层 / 组件层完成：`DailyFlow` 已按本地天倒序；员工详情复用 staff-scoped `DailyFlow` 或在组件按天 group。

## Consequences

- **+ 零数据层改动**；不污染 `StoragePort` / Repository 契约（保持 [ADR-0001](0001-storage-port-shape.md) / [ADR-0002](0002-derived-inventory-never-stored.md) 的简洁）。
- **+ 本地数据下首屏快、滚动顺**（`FlatList` 已虚拟化）；「分批」满足用户对渐进加载的感知。
- **− 全量记录仍一次性载入内存。** 数千条无压力；若记录增长到**数万量级**，单次 `list()` 的载入 + `DailyFlow` 全量重算会成为瓶颈——届时再引入数据层分页 / 增量派生，**本 ADR 复访**。
- **− 批大小与天边界需协调**：不能把同一天的记录劈到两屏而丢了天分隔线 → 按「日」分批（每批若干整日），而非固定行数；`onEndReached` 揭示下一组日。

## Alternatives considered

- **(B) 数据层 `limit/offset` 分页**：否决——本地数据下收益不抵契约复杂度；`StoragePort` 目前无分页能力，加它违背「派生读保持纯计算、一次性」的简洁（[ADR-0002](0002-derived-inventory-never-stored.md)）。留作数万记录量级的复访项。

## References

- 页面优化重构 PRD: [.scratch/2026-07-10-page-refactor/01-page-refactor.md](../../.scratch/2026-07-10-page-refactor/01-page-refactor.md)
- Related: [ADR-0001](0001-storage-port-shape.md)（单一 seam，InMemoryAdapter 复用）, [ADR-0002](0002-derived-inventory-never-stored.md)（派生读不存储、一次性）, [ADR-0005](0005-ui-layer-architecture.md)（UI 层架构，被测对象）
