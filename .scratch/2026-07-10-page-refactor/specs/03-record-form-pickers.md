# 记账录入表单 — 商品 chip + 步进器、备注 label:input、时间按钮化、出单

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #1

## Goal

重建录入表单的明细录入 UX：商品搜索结果以可点 chip 呈现（点 = 选中并 qty 1，再点 = +1，不重复建行），每行用数字步进器（−/[input]/+）精调数量，备注改单行 `label: input`，时间控件按钮化（一眼可点）——并应用「出单」方向文案。提交 payload、校验、EDIT 的稳定 item id 合并契约**均不变**。

## Acceptance criteria

- [ ] 搜索商品渲染为 chip；点某商品 chip 新增一行 qty=1；再点**已选**商品的 chip 则其行 qty += 1（不重复建行）——证明 chip 拣选 + 自增（故事 3）。
- [ ] 每个已选明细行有步进器 `− [qty input] +`：`+`/`−` ±1（不低于 1；qty=1 时 `−` 禁用，删行走「删除」），input 可直输数字（提交前校验正整数）；行金额 + 合计随之实时更新——证明步进器精调 + 即时金额（即时金额继承 #06；故事 3）。
- [ ] 备注渲染为 `备注：[单行 input]`（label:input 同行，非 multiline）——证明备注重构（故事 6）。
- [ ] 时间控件为按钮化 Pressable（`inputBg`+`border`+`formatDateTime(timestamp)` 文本 + 一个 affordance 图标），点击挂载 picker；Android dialog confirm/cancel unmount 契约保留、iOS inline 保留——证明可点 affordance（故事 7）+ 日期格式（故事 4）。
- [ ] 方向文案 out = 「出单」，in = 「入库」——证明文案改（故事 2）。
- [ ] 校验仍阻止提交（无明细 / 数量非法 / 无员工）；合法提交走 create/update，**payload 结构不变**；EDIT 模式各行仍携带稳定 item id（touched/untouched 合并契约不破）；out 超持仓不阻——证明写路径无回归（故事 18；#06/#07 不变式）。

## Scope

- **In**: `components/record-form.tsx`（chip 拣选、步进器、备注 label:input、时间按钮化、出单文案）；`record-form.test.tsx`（为新交互重写）；消费 `formatDateTime`（#01）。
- **Out**: `formatDateTime` 本身（#01）；`validateRecordForm` 规则（不变——步进器只是换种方式喂数量）；create/update repo 内部；staff-row / staff-detail / summary。

## Context

- 现状：`record-form.tsx` 搜索→匹配列表→`pickProduct` 加**空 qty** 行→裸 `TextInput keyboardType="numeric"`；`DIRECTION_LABEL = { in:'入库', out:'出库' }`；`@expo/ui` DateTimePicker（Android dialog mount/unmount、iOS inline）；EDIT 行携带稳定 `id`。
- `record-form-validation.ts`（`validateRecordForm(staffId, lines)`——staff / ≥1 项 / 每项有商品 / qty 正整数）。
- PRD 记账 #3 / #4 / #6 / #7；PROJECT_KNOWLEDGE（Android dialog mount/unmount——commits b0b6cd9 / 7aea40b，不可回退）；ADR-0006（RNTL——须 `await fireEvent.*`）。

## Design

- **Interface delta**: `<RecordForm staffId direction edit? onSaved? />` 签名**不变**。内部新增展示子件：chip 列表（搜索结果）+ 每行一个 `<QtyStepper>`。消费 #01 的 `formatDateTime`。
- **Internal architecture**:
  - **商品拣选**：搜索结果（`useProducts({ search: { text } })`）渲染为 Pressable chip；`pickProduct(p)`——productId 已在 lines 则 qty += 1，否则新增 qty=1。**spec 锁定**：pick 后**不清空**搜索框（让 chip 留住可重复点 +1），仅提交/返回时清。
  - **QtyStepper**：`−`（qty=1 时 disabled）+ 受控 TextInput（`keyboardType="numeric"`）+ `+`；onChange 走既有 `setQty` 路径；保留「删除」行控件。即时时长仍 render 时派生（`price × qty`）。
  - **备注**：单行 TextInput + label（复用管理 tab `StaffForm` 的 field/label 样式语汇），`multiline={false}`。
  - **时间**：按钮化 Pressable（`inputBg`+`border`+`formatDateTime` 文本 + Ionicons 图标）→ 既有 mount/unmount picker 逻辑原样复用；`testID="record-time"` 保留。
  - **出单**：`DIRECTION_LABEL.out = '出单'`。
  - **Deep-module note**: QtyStepper 是小的可复用展示件（放本文件或抽到子件，spec 定）。表单的**写契约不变**（快照/合并/失效都仍藏在表单后）——这是不能破的硬约束，步进器只改「怎么喂数量」。

## Rework on failure

隔离在 record-form + 其测试；repo 重新校验，故数量/picker bug 无法污染账本。若 EDIT 合并出问题，根因在步进器如何喂 line id（UI），非 repo 合并。
