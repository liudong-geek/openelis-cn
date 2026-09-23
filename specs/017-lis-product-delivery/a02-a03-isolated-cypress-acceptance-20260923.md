# A-02/A-03 隔离浏览器门禁与有限诊断

日期：2026-09-23。候选源码提交：`5448226d354993e54b3f730d1a84272a9fdee68c`；比较基线：`3e1e3b402fc549236c28446cc53cd652c913385b`。

## 结论

**原完整 Cypress fail-fast 已实际执行，但未通过。** 不能将此记录写成浏览器门禁全绿，也不能据后续跳过的统计宣布业务流程通过。

隔离测试资源已于 **22:56:17（北京时间）** 清理完毕。结束时原四核心容器的 ID、镜像、启动时间及静态配置没有变化。主线程此后进行的正式前端部署不属于本次测试窗口，不纳入漂移判定。

本次没有修改产品或 Cypress 测试文件、删减 spec、放宽断言，也没有 commit/push。下列接线核对、失败证据和诊断有不同证明范围。

## 限定接线检查

- Dashboard 待审核任务卡、快捷操作和流程入口均到 `/validation?scope=pending`；轻摘要使用 `/rest/review/pending/summary`，不再展示旧全局审核计数。
- 既有 `/validation` 路由仍要求 Validation 角色。SearchForm 在 pending 模式自动读取 `/rest/AccessionValidation?scope=pending`；未知 scope 及 pending/过滤混用明确拒绝，后台仍独立验证。
- 两个读取接口均要求 VALIDATION，实际 actor 来自服务器请求；查询进入 ReviewPendingService。保存继续使用 query-bound consumeSubmission、原 ReviewSubmissionService 和签名/状态约束。
- 审核页保留 queryId、scope、分页号校验，整次查询摘要不从本地页行数反算；切换查询继续受未保存修改/提交待确认守卫限制。
- 限定接线未发现新阻断；这不是整体审核写入或完整 A-02 的完成声明。后端 121 项和 Results 读取会话的独立冻结签收仍见对应审查文档，本次未重复运行。

## 实际隔离边界

- 私有根目录：`/private/tmp/lis-active-20260923/a02-cypress-isolation`，目录0700；数据库导出、凭据和原始检查文件0600。
- 从现有开发库执行 `pg_dump`，强制 `default_transaction_read_only=on`，仅将导出还原到新建的测试数据库；没有将 fixture 或业务请求发到现有业务库。
- 新 DB 固定名 `openelisglobal-database`，用于兼容旧 Cypress task 的固定容器名称。启动前确认该名称不存在；卷和 internal 网络均为本次专属并带归属标签。
- 测试后端使用候选镜像 `sha256:cc1e3a62703eee5b045d2200fa61e3e85264fc5a4d2cf0f2716ae118948a7758`，数据源仅指向测试网络内的 DB。没有挂载业务日志、lucene、branding 或业务数据库卷；配置及证书为私有副本。
- 未启动 FHIR、仪器或其它服务。复制配置的本地/远端 FHIR、订阅及注册地址实际为空，网络保持 internal。
- Docker Desktop 的 internal 网络没有实际发布配置中的28084端口。未增加外联网卡，改为本机18084代理调用固定测试容器 ID 内的 curl，经容器自己的 localhost:8443 访问 API。请求体从 stdin 传递，状态/响应头/cookie 保留并按现有代理适配路径；不跟随外部重定向。静态资源从私有 dist 快照直接提供，API 并发上限4。
- 真实认证预检已通过：独立测试 cookie jar 登录成功，`/session` 返回 authenticated=true，随后才执行原门禁。

## 完整原门禁结果

- 时间：**22:47:06—22:50:12**，调用总耗时约185.53秒，含 Cypress/Chrome 启动和跳过后续文件的开销。
- 实际工具：Cypress **15.12.0**，Chrome **153 headless**。首次二进制校验成功，不存在“工具未安装”的阻断。
- 原命令：`npm run cy:failfast`；只指定隔离 baseURL、既有 fail-fast 开关及私有截图/视频输出目录。
- **34 个 spec 全部选入**；没有用 spec/exclude 缩小范围。实际退出码 **1**；测试输入文件执行前后 hash 一致。
- 首失败：`frontend/cypress/e2e/login.cy.js:24:54`，`Login Test Cases > Tries to login without credentials`。
- 实际错误：3,000毫秒内找不到英文文本 `Username or Password are incorrect`。首文件耗时约24秒，**0通过、1失败、7跳过**。
- 原工具最终统计为 **349例：33 passing、1 failing、315 skipped**。后续33个文件均记录 `Stopping Cypress runner due to a previous failure` 并快速停止；不能将这些 reporting passing 数字当成33条业务流程已完成。保留原统计，不改成全绿。
- 虽然配置中的 `FAIL_FAST_STRATEGY='spec'` 注释值得另行维护，本次实际日志已证明跨文件停测生效；没有更换参数或重跑来改写结果。

## 三个事实必须分开解释

1. **旧断言的实际失败。** 首失败明确查找英文字符串。故障截图中地址是测试18084，登录界面为中文；失败时请求仍显示 pending，未看到错误通知。不能仅凭该截图断言“中文错误通知已经显示，只是英文匹配错了”。
2. **等待时间的边界。** 另做了一次独立、诊断用途的空凭据浏览器操作。实际 POST 返回 **401**，JSON错误键为 `error.invalidcredentials`；从点击准备至响应事件观测约 **7381毫秒**。该结果来自隔离 docker-exec 代理及当时本机负载，不能直接当作正式部署的接口耗时；它说明原先3秒的文本等待不能可靠覆盖这次诊断链路。
3. **实际通知仍未证实。** 诊断观察到按钮文本“登录”；约3秒开始的检查中，中英文错误都未出现。后续60秒没有捕获中文通知，因此**不能写中文提示已完成实页验证**。CustomNotification 的错误 toast 会在3秒后自动关闭，而诊断在响应后才继续等待通知，存在观察时序遗漏的可能；也未排除通知呈现问题。没有再开展第二轮浏览器实验或据源码直接认定可用。

因此本次证据只能说明：原门禁失败；错误认证确实被服务器拒绝；本地诊断链路超过旧等待窗口；中文错误通知呈现仍待后续专门验证。不能把失败唯一归因于翻译，也不能把未观察到的通知直接断言为本批新增缺陷。

## 与基线的差异核对和后续维护范围

实际比较 `3e1e3b402f` 到 `5448226d35`：Login.jsx、App.jsx、语言选择模块、Layout、CustomNotification、全部 Cypress 文件及 Cypress 配置均无变化。两版 `zh.json` 的 `error.invalidcredentials` 都为“用户名或密码不正确”，登录按钮键都为“登录”。候选新增翻译键没有改变这两个值。

下一次维护应保留业务与安全断言，并按实际中国版交互补齐测试合同：

- 先针对已有登录用例，在操作前同时监听真实认证响应和错误提示，核对拒绝状态/错误键、用户仍未认证且未进入工作台；使用当前支持语言的文案或稳定可访问定位，避免先错过短暂通知再查询。
- 实际查清提示是否出现后再决定修产品或修定位，不能仅把等待时间扩大来宣布问题解决。该诊断不替代后续完整原门禁。
- LoginPage.goToHomePage 仍包含英文 Login 定位及旧 TestProperties 账号配置；环境变量不能覆盖所有 Page Object。登录8例中的密码修改及恢复应保留，并始终仅在独立数据库执行。
- HomePage 的旧 `a.cds--link + Ready For Validation` 定位与本候选的新待审核任务卡不同，后续应核查新入口的角色、任务数单位及实际 pending 路由，不能恢复旧无效界面迁就测试。
- 不批量跳过后续管理/申请/结果/审核用例；后续失败须依次记录并以真实页面合同维护。此次没有执行这些维护，也没有宣布其它旧用例一定兼容。

## 核心服务不变证明和清理

原 `test-result.json` 的 `coreUnchanged=false` 如实保留。进一步连续三次读取 Docker inspect，准确定位为正式 webapp 的 **Mounts 数组顺序变化**，没有静态配置条目变化：

- 第0份完整私有快照重算得到与开始时原始 configSha 完全相同的摘要，证明补充比较使用原基线，而非换一份基线绕过检查。
- 相邻快照的 Config 与 HostConfig 逐字段完全相同；变化字段全部属于 Mounts 的排列。将每条完整 mount 记录规范排序后逐条相等，保留 Source、Destination、Type、RW 等全部字段，没有忽略挂载内容。
- 清理后四核心的 ID、image、StartedAt、Config、HostConfig 和规范排序后的完整 Mounts 均与该原基线相同。补充证明 `core-semantic-proof-after-cleanup.json` 为 true；原始顺序敏感的 false 同时保留。
- 22:56:17 清理完成：自己的2个容器、专属卷和网络均不存在，18084/28084关闭，导出及临时 env/配置/证书已删除。测试代理会话已停止。
- 不使用全局 prune、不停止或重启正式容器、不修改正式业务数据。主线程22:56以后的正式前端部署单独记载。

## 证据位置

私有根目录下保留：

- `test-start.json`、`test-result.json`、`test-inputs.json`、`frontend-snapshot.json`。
- `evidence/cypress.log`；`evidence/screenshots/login.cy.js/Login Test Cases -- Tries to login without credentials (failed).png`。
- `evidence/login-diagnostic.json`、`login-diagnostic-at-3s.png`、`login-diagnostic-error.png`。
- `core-before.json`、`core-semantic-proof-before-cleanup.json`、`core-semantic-proof-after-cleanup.json`、`cleanup.json`。

原始容器检查和后端日志可能包含配置/凭据，保持私有，**不能提交 Git 或写入公开报告正文**。此文只包含脱敏结论。浏览器门禁未通过状态必须继续进入交付台账；本次清理和只读接线检查不关闭 A—E 任一完整需求。
