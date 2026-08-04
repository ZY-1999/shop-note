# 导入模板示例行 + 补货顶栏同行

Type: spec
Status: ready-for-agent
Parent: #02
Blocked by: None — can start immediately

## Goal

三类导入模板各增一行可对照示例，并将补货段「选择商品补货」与「导入」收至同一顶栏行。

## Acceptance criteria

### 模板示例

- [ ] 会员/商品/补货 `build*ImportTemplate` 输出表头 + **恰好一行**示例；列与现导入表头一致 — 真机可对照填写
- [ ] 会员示例含合法等级展示词（普站/星站），可被 `parseStaffImportWorkbook` 读出；姓名**不是**「管理员」；商品示例可被对应 parse 读出；补货示例 parse 出一行即可（preview ok 不要求；进失败区可接受）— 示例可被管道理解
- [ ] 补货示例对用户有可感知指引（如商品名含「示例」，或等价说明）：提示改成库内已有商品名或删除该行 — 避免误导入教学行
- [ ] 相关 `build-*-import-template` 单测断言表头 + 恰好一行示例并通过；`import-form` 下载模板测例若断言 sheet 形状须同步更新 — 回归
- [ ] 父 PRD `#01` 或本 bug `#02` Comments 注明模板条款修订为「表头 + 一行示例」— 文档对齐

### 补货顶栏

- [ ] 管理 → 补货：第一行顶栏左「选择商品补货」、右「导入」，不再分行 — UX
- [ ] restock 视图测断言两者同处第一行顶栏并通过 — 回归

## Scope

- **In**: 三个 template builders + 单测；`import-form` 中下载模板 sheet 形状断言（若有）；RestockManage 顶栏布局 + 视图测；issue Comments 一句修订说明。
- **Out**: 读文件沙箱；静默跳过示例行；为补货示例自动匹配/创建商品；预览换行展全文；改导出列或导入写入语义。

## Context

- 父 bug `#02`；父特性 PRD `#01` 原「仅表头」→ 本 bug Expected 刻意修订。
- 既有：`build-*-import-template` 单测；`ManageTab` / RestockManage；`parse*ImportWorkbook`。
- 预览长字段省略为 UX 锁定（非本 spec）。

## Design

- **Interface delta**
  - `buildStaffImportTemplate` / `buildProductImportTemplate` / `buildRestockImportTemplate`：返回的 workbook = 表头行 + **恰好一行**示例数据行（列顺序与现表头一致）。
    - 会员示例：等级为「普站」或「星站」之一；姓名/电话/备注为占位可识别文本。
    - 商品示例：名称 + 单价元（可被现 parse 接受的字符串）。
    - 补货示例：商品名称 + 数量；不要求库内存在；模板侧可用备注单元格或固定说明文案提示「示例请改成库内已有商品名或删除」（若表头无备注列，说明落在示例商品名后缀如「（示例）」或 issue/下载 dialog 文案——优先示例商品名含「示例」字样，避免扩列）。
  - RestockManage 顶栏：同一 `filterBar` 行内左侧文案「选择商品补货」、右侧既有 `restock-import`「导入」；删除其下单独一行说明 Text。
  - 文档：在 `#02` Comments（或 `#01` Comments）追加一句：模板由「仅表头」修订为「表头 + 一行示例」。
  - **Deep-module note**：template builders 仍是薄纯函数；顶栏为布局微调。无加深必要。

- **Internal architecture**
  - 测试缝：既有 `build-*-import-template` 单测扩展；`import-form` 下载模板测例中 sheet 行断言同步为表头+示例；RestockManage / ManageTab 既有或邻近视图测加顶栏断言。
  - 不改 parse/preview 以跳过示例行；补货示例进 fail 区为预期。
  - 会员示例姓名避开保留名「管理员」。

## Rework on failure

failure is isolated; redo this spec only（回退三模板 + 补货顶栏 + 相关测/注释）。
