# B-01 / E-01 检验项目列表加载期间筛选连续性

变更编号：CHG-129。候选基准：`fde5b02624e2ec8d7cea413abbd201d508bd2bf8`。

## 真实故障依据

2026-10-16 的 a13 原完整浏览器验收在 `testManagement.cy.js` 第三项失败。前两项“导航到目录”和“创建停用项目并查回”已通过；第三项在 3000 ms 内没有找到 `#filter-status [role=option]` 中的 `Inactive/停用`；第四项因 fail-fast 未执行。原失败截图、原生结果和日志保留在 a13，本候选没有改动或重跑它们。

截图记录了展开状态下拉框后搜索参数写入 URL，随后列表 GET 200；下拉选项消失。产品的 300 ms 搜索防抖触发 `setLoading(true)`，外层条件分支卸载整个 DataTable，连同搜索框和 Carbon Dropdown 一并卸载；响应结束后重新挂载 Dropdown，其展开状态丢失。错误分支同样卸载查询控件。

## 修改范围

只移动列表的加载、错误和空结果渲染边界。DataTable、工具栏、搜索框和筛选面板保持挂载；加载和错误状态显示在结果区。加载或失败时 DataTable 接收空行，旧行和批量选择不可操作，批量动作同时显式禁用。当前响应成功后显示当前结果。

请求参数、300 ms 防抖、AbortController、URL 同步、分页、错误重试、创建与编辑弹窗及保存身份逻辑保持原实现。没有修改 Cypress 助手、断言、3000 ms 预算、数据库、测试业务记录或冻结浏览器输入。

## 组件验证

使用真实 TestCatalogList、Carbon Dropdown/DataTable 和现有 React Router/Intl。只使用原测试文件已有的 API mock 契约控制请求完成时点，不替换 React 结构。沿用原 14 项列表测试和原 3 项返回上下文测试，新增 4 项：

- 防抖触发请求时搜索框和状态下拉框保持同一 DOM 实例，展开的停用选项在请求期间及完成后均可操作。
- 用户继续输入时保留输入焦点，并取消前一个未完成请求。
- 查询失败后保留筛选控件、显示错误并按原条件重试。
- 加载另一页时不提供旧行操作或旧批量选择，完成后不恢复旧选择。

同一份最终测试对基准实际源码运行：21 项中 3 项失败、18 项通过，失败均由查询控件被卸载触发。对应候选实际源码运行：21 项全部通过，耗时 15.01 秒。原 17 项测试内容未删除、未修改；另有 4 项回归。

外部运行入口的初次 cwd/setup 解析失败单独保留，不计产品红。早期新增批量按钮检查曾错误查询已卸载或隐藏的按钮，已更正为只检查当前 DOM 中可操作状态；早期日志独立保留，不计最终产品红。

## 精确复用命令

工作目录为候选基准仓库的 `frontend`。以下配置只把两个外部源/测试文件映射到原模块依赖，缓存写入外部候选目录：

```sh
CATALOG_LOADING_BASELINE=1 /usr/local/bin/node /Users/ld/Documents/lismyself/outputs/lis-normal-acceptance-20261011/repository-patient-next/frontend/node_modules/vitest/vitest.mjs run --config /Users/ld/Documents/lismyself/outputs/lis-six-batch-20261013/test-catalog-loading-continuity-a13/vitest.config.mts --maxWorkers=1
/usr/local/bin/node /Users/ld/Documents/lismyself/outputs/lis-normal-acceptance-20261011/repository-patient-next/frontend/node_modules/vitest/vitest.mjs run --config /Users/ld/Documents/lismyself/outputs/lis-six-batch-20261013/test-catalog-loading-continuity-a13/vitest.config.mts --maxWorkers=1
```

## 待完成验证

本次只有真实组件红绿验证，不等同真实浏览器、完整发布或医院验收。真实页面验证安排在候选集成并冻结后的新鲜隔离环境完整 349 中，不另起 a13 静态服务或诊断副本。原 `testManagement.cy.js` 第 2 项在全新隔离数据库中按原套件一次创建并查回；第 3 项按原 `applyAndKeepListState` 完成搜索、停用筛选及每页 10 条，第 4 项按原 `linkedEditorAndReturn` 验证关联配置及返回上下文。原步骤、断言、预算和防抖时序保持不变，不添加等待避开加载边界。

上述新鲜环境执行不重放 a13 已成功的写入。a13 已创建记录、原始失败证据和八个隔离卷保留；当前 remaining199 使用的静态产物、容器及绑定不变。完整 349 的真实结果尚待产生，不能以本次 21 项组件通过替代。

隔离候选已集成。根任务在仓内实际源码运行原列表及返回上下文测试，2 个文件、21 项全部通过，耗时 44.31 秒；独立源审无阻断。尚未推送、未部署。正式服务和业务数据未触碰。
