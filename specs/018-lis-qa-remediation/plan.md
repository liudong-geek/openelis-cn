# LIS 产品整改开发计划（QA 整改）

> 版本：v1.1
> 日期：2026-09-05
> 范围：基于 017-lis-product-delivery 产品审查结论的整改执行计划
> 结论口径：产品审查（实测 + 文档）确认的问题，非推测

## 0. 执行状态（2026-09-05 晚）

| # | 状态 | 说明 |
|---|---|---|
| 1.1 英文残留清理 | ✅ 已完成并验证 | 待接收电子申请状态下拉已全中文（待确定标本/已取消/已录入/不符合/已实现），浏览器实测通过 |
| 1.2 登录表单字段绑定 | ✅ 已完成并验证 | Login.jsx 补 name + initialValues 对齐，登录成功进入工作台 |
| 1.3 测试数据隔离 | ⏸ 脚本就绪待执行 | 清理脚本 dry-run 通过；实际 COMMIT 为高风险删除，待用户确认 |
| 2.x 工程还账 | ⏳ 待启动 | Sprint 2 后续安排 |

**执行记录（1.1）**：
- 根因一（后端）：`DisplayListService.createElectronicOrderStatusList()` 用 `getDefaultLocalizedName()` 返回数据库英文名，绕过 i18n → 改为 `getLocalizedName()`；新建 `message_zh.properties`（13 个 status.* 中文 key）。
- 根因二（后端缓存）：`typeToListMap` 是进程级静态缓存、不区分 locale，应用首启后用默认英文生成状态列表并缓存，后续 zh 请求读到缓存的英文 → `getList()` 对 `ELECTRONIC_ORDER_STATUSES` 改为每次按当前请求 locale 重新生成（数据量仅 5 条）。
- 根因三（资源权限）：`message_zh.properties` 经 docker cp 后权限为 600（owner 501），Tomcat 进程用户 tomcat_admin 无读权限，ResourceBundle 加载失败回退英文 → 容器内修正为 644。
- 验证：GET /api/OpenELIS-Global/rest/displayList/ELECTRONIC_ORDER_STATUSES（Accept-Language: zh-CN）返回「待确定标本/已取消/已录入/不符合订单/已实现」；浏览器实测待接收电子申请页状态下拉全中文。GlobalLocaleResolver 探针确认 header 解析正确（zh-CN→zh_CN）。

## 1. 背景与依据

2026-09-05 对 openelis-cn（OpenELIS 中国医院版）进行了产品角度审查（含交互体验），主要结论：

- **已达成的**：任务化工作台、四步订单流程、审核空状态引导、业务闭环 5 步可视化等改造真实落地。
- **未达交付标准的**：HIS/危急值/报告生命周期闭环、中文主数据、界面英文残留、工程欠账（TS 诊断 1158 条、主布局包 7.65MB）。

审查信息来源：本机部署实测（登录、工作台、申请四步流程、结果录入/审核、报告等页面）+ `specs/017-lis-product-delivery`（spec.md、kingt-lis-benchmark-and-product-blueprint.md、release-baseline-2026-09-01.md、tasks.md）。

## 2. 目标与范围

**目标**：从"可演示的测试闭环"提升到"可进入医院试点验收的交付候选"。

**本轮范围**（本机可完成）：Sprint 1 三项 + Sprint 2 前两项。
**明确例外**（需外部条件，非本轮承诺）：主数据补齐、HIS/危急值/报告生命周期闭环——需要医院接口文档、真实主数据与试点环境。

## 3. 分批次计划（产品经理视角）

### Sprint 1 —— 立即可整改（纯前端/配置，低风险高回报）

| # | 整改项 | 优先级 | 验收标准 |
|---|---|---|---|
| 1.1 | 界面英文残留归零 | P1 | 主流程页面无影响理解的英文；"AwaitingSpecimen" 等状态文案中文化；业务值（如 Serum=血清）保留映射不误改 |
| 1.2 | 登录表单字段绑定修复 | P1 | Login.jsx 输入框补 `name`，与 formik initialValues 对齐；表单提交正常；curl 回归通过 |
| 1.3 | 测试数据隔离/标注 | P1 | DEV 订单/患者不再混入演示环境，或明确标记为"演示数据" |

### Sprint 2 —— 工程还账

| # | 整改项 | 优先级 | 验收标准 |
|---|---|---|---|
| 2.1 | TypeScript 诊断归零 | P1 | `npm run check` 无新增诊断，存量逐步收敛 |
| 2.2 | 前端包体拆分 | P1 | 主布局包 7.65MB 显著下降，首屏性能改善 |
| 2.3 | 标本管理页产品化 | P2 | 签收/拒收/重采入口收敛到主流程（部分依赖业务设计） |

### Sprint 3 —— 需外部条件（列为依赖项）

| # | 整改项 | 优先级 | 依赖 |
|---|---|---|---|
| 3.1 | 主数据补齐 | P0 | 医院签字目录（183 启用项目编码/标本映射等） |
| 3.2 | HIS/危急值/报告生命周期闭环 | P0 | HIS/收费/CA 接口文档、试点环境 |

## 4. 任务拆解（开发组长视角）

### 1.1 英文残留清理

- **涉及**：`frontend/src/components/**`、`frontend/src/languages/zh.json`、相关服务层状态映射
- **方案**：
  1. 定位硬编码英文（UI 文案 vs 业务值分类）
  2. UI 文案：抽 i18n key 或直接替换中文
  3. 业务值（如 Serum/CRITICAL/NUMERIC 等字典值）：确认展示层映射，中文化展示
- **验证**：`npm run check:delivery`（中文资源门禁）+ 页面走查 + 构建

### 1.2 登录表单修复

- **涉及**：`frontend/src/components/Login.jsx`
- **方案**：TextInput/PasswordInput 补 `name="username"/"password"` 与 formik 对齐；确认后端 `/ValidateLogin` 字段映射
- **验证**：浏览器登录 + curl 回归（loginName=admin 成功 / username 应被正确映射）

### 1.3 测试数据隔离

- **方案**：确认 DEV 数据来源（运行期创建，不在初始化脚本）；提供清理脚本与演示数据标注；不擅自动生产/正式数据
- **验证**：申请列表/工作台数据核对

## 5. 工程纪律

- 每项整改**独立 git commit**（工作区，不直接推送 GitHub，待用户确认）
- 每项整改后**构建验证**：前端 `npm run build` + 需要时 `docker compose up -d` 重建，确保不破坏现有可运行闭环
- 英文残留改动面大：先改高频/主流程，逐页走查
- 登录表单改动小：先行验证

## 6. 风险与例外

| 风险 | 控制 |
|---|---|
| 英文残留误改业务值 | 分类处理，业务值仅改展示层映射 |
| 测试数据清理破坏演示 | 提供可回滚的清理脚本，标注演示数据 |
| 前端改动破坏现有闭环 | 每项独立构建验证 + git 可回退 |
| Sprint 3 范围过大 | 明确列为依赖项，不在本轮承诺 |
