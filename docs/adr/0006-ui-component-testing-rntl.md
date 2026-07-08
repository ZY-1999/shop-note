# ADR-0006: UI 组件测试 —— React Native Testing Library + 真实 InMemoryAdapter，覆盖用户行为

- Status: **Accepted** (2026-07-09)
- Scope: shop-management-ui 的 UI 层测试策略（组件 / hook / 屏幕 / 用户行为流）

## Context

[ADR-0004](0004-adapter-verification-device-smoke.md) 定了**数据层**的验证范式（纯逻辑 Jest + device smoke）。但 UI 层（屏幕 / hook / 交互）此前无自动化测试——codemap 标注“device/UI test strategy not yet set up”，系统 PRD 也写过“UI 不做单测”。首批 UI 要建十几块屏幕和多条交互流，纯手动验证回归代价高、易漏。需要为 UI 层建立一套自动化组件测试。

难点：UI 通过 React Query hook 消费数据层（见 [ADR-0005](0005-ui-layer-architecture.md)），测试要么 mock 掉数据（轻但漂移、不验证真实数据流），要么接真实数据层（覆盖强但要解决 React Query + repo 注入）。

## Decision

**用 React Native Testing Library（RNTL）做组件 / 行为测试，数据层接真实 `InMemoryAdapter`，不 mock Repos。**

1. **依赖**：`@testing-library/react-native` + `jest-expo` 预设（Expo 官方 jest 配置）。
2. **数据层 mock 方式 = 真实 `InMemoryAdapter` + `setupRepos`**。复用 [ADR-0001](0001-storage-port-shape.md) 的单一测试 seam：组件测试 = 真实数据流 + UI 渲染。通过测试专用 Provider 注入 InMemory repo 集 + 内存 `QueryClient`。
3. **测试驱动 = 用户行为**。优先从用户视角写：搜索 → 点击入库 → 填明细 → 提交 → 观察库存更新。用 `fireEvent` / `userEvent` 驱动，断言可观察结果（渲染文本 / 列表项 / 派生数字），而非断言内部状态。
4. **覆盖范围（尽量覆盖到用户行为）**：
   - 金额格式化（`MoneyText`：Cents→元、负数→欠货、正负色）。
   - 展示组件（`StaffRow` / `RecordCard` / `ProductRow` 等）。
   - 全部 hook（query 返回 + mutation 成功后 invalidate 触发刷新）。
   - 表单：出入库多明细录入（明细增删 + 即时金额计算 + 校验）、员工/商品 CRUD 校验。
   - 屏级集成：记账 / 汇总 / 管理 三 tab。
   - 用户行为流：新建记录→库存更新、编辑→余额变、作废→余额归零、假删除→选择器消失、改进货价→金额重估、每日流水渲染、组合根 `open` 失败→错误屏+重试（mock `open` 抛错）。
5. **边界（RNTL 不覆盖）**：跨屏导航 push 用 mock router 只验证导航调用 + 目标屏可独立测；真实 SQL 执行留 [ADR-0004](0004-adapter-verification-device-smoke.md) device smoke；深色模式 / 手感留手动。

## Consequences

- **+ 用户行为级回归网。** 重构 / 改 UI 时，用户视角的关键流有自动化保护，不纯靠手动。
- **+ 真实数据流，不漂移。** 接 InMemory repo，组件测试同时验证 UI + 数据层契约，mock 漂移风险低。
- **+ 与数据层测试 seam 统一。** 同一个 `InMemoryAdapter` 服务数据层单测和 UI 组件测试。
- **− 测试基建更重。** 要装 RNTL + jest-expo、配 Provider wrapper、统一 query key、处理 React Query 的 `act` / 异步。
- **− 跨屏端到端仍靠手动 + device smoke。** RNTL 聚焦单屏 / mock-router 内的行为，不取代设备验证。
- **− 版本兼容风险。** RNTL / jest-expo 需兼容 React 19.2 / RN 0.86 / Expo 57（均新版），spec 阶段查证锁定具体版本。

## Alternatives considered

- **mock 掉 Repos / hook（`jest.mock`）**：否决——只测 UI 渲染，不验证数据流，易与真实数据层漂移，给假信心。
- **Detox / E2E**：否决——过重，且首批不需要跨进程真端到端；RNTL + 真实 InMemory 已覆盖绝大部分行为，device smoke 覆盖真 SQL，组合足够。
- **保持“UI 不做单测，纯手动”**：否决——屏幕和交互流数量增长后手动回归代价过高。

## References

- UI PRD: [.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md](../../.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md)
- Related: [ADR-0001](0001-storage-port-shape.md)（单一 seam，InMemoryAdapter 复用）, [ADR-0004](0004-adapter-verification-device-smoke.md)（数据层验证范式，本 ADR 是其 UI 层对应）, [ADR-0005](0005-ui-layer-architecture.md)（UI 架构，被测对象）
