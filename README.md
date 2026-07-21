# shop-note

本地优先、单操作员、离线可用的店铺记账应用（Expo SDK 57 / React Native）。无后端、无同步；数据落在设备本地 SQLite。

面向日常门店场景：给会员**充值**、从**全局库存**出库记账，并在汇总页查看库存与流水。

## 功能概览

三个主 Tab：

| Tab | 做什么 |
| --- | --- |
| **记账** | 搜索会员 → 充值 / 出库；点进会员看余额与历史 |
| **汇总** | 库存卡 + 时间段内综合流水（充值 / 出库）与单数·零售聚合 |
| **管理** | 会员 · 商品 · 补货 · 配置（全局单价等） |

核心业务语义：

- **全局库存**：管理员补货入库，会员只出库；库存与余额均为派生值，从不落库。
- **会员余额**：Σ 充值 − Σ 出库金额；允许负余额（欠款）。
- **作废**：软删除（`voided_at`），不做物理删除；历史可回看。

更完整的领域词表与不变量见 [CONTEXT.md](CONTEXT.md)。

## 技术栈

- Expo SDK 57、React Native、Expo Router（`(tabs)` + 根 Stack）
- `expo-sqlite` + 自有仓储层（`src/data/`）
- TanStack Query（读模型 / 写后失效）
- Jest + React Native Testing Library

> **仅 iOS / Android**。不支持 Web（见 [PROJECT_KNOWLEDGE.md](PROJECT_KNOWLEDGE.md)）。

## 环境要求

- Node（建议见 [.nvmrc](.nvmrc)）
- [pnpm](https://pnpm.io)（仓库含 `pnpm-lock.yaml`；`.npmrc` 使用 `node-linker=hoisted`）
- Android Studio / Xcode（真机或模拟器开发构建）

## 快速开始

```bash
pnpm install
pnpm start          # Expo 开发服务
```

原生运行（需本机已配置 Android / iOS 工具链）：

```bash
pnpm android        # expo run:android
pnpm ios            # expo run:ios
pnpm build:android  # expo prebuild --platform android
```

改动依赖或 Metro 配置后，建议清缓存启动：`npx expo start --clear`。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm start` | 启动 Expo |
| `pnpm test` | Jest（UI 用例建议加 `--forceExit`，见 PROJECT_KNOWLEDGE） |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `expo lint` |

## 目录导读

```
src/app/           # Expo Router：Tabs + 表单 / 详情 Stack
src/components/    # UI 组件
src/data/          # 仓储、派生读模型、迁移
src/hooks/         # React Query 读写 hooks
docs/adr/          # 架构决策
docs/codemap/      # 代码地形图（给 agent / 新人导航）
.scratch/          # 本地 issue / PRD / spec 追踪
```

深入阅读：

- [CONTEXT.md](CONTEXT.md) — 领域语言与不变量
- [docs/adr/](docs/adr/) — ADR（含 UI 架构、测试策略、迁移策略）
- [docs/codemap/project.md](docs/codemap/project.md) — 项目级 CodeMap
- [AGENTS.md](AGENTS.md) — Agent / 开发约定入口
- [PROJECT_KNOWLEDGE.md](PROJECT_KNOWLEDGE.md) — 长期踩坑与约定

## License

见 [LICENSE](LICENSE)。
