# R02：报告成员证据、历史原件及打印权限

日期：2026-09-16。增量基线为 `.work/r02-start-snapshot`（包含R01实现）；隔离工作目录 `.work/openelis-r02`。本批不把R01改动重复计为新增，也不提前启用R03签发。

## 业务与数据

新草稿在现有 `PatientReportRelease` 冻结完整成员归属：`schemaVersion=1`、documentId、patientId、sampleId、groupKey、ruleVersion和全部analysisIds。JSON与SHA256在创建时写入，Hibernate禁止后续更新；086迁移不回填旧记录。签发结果内容、模板、临床元数据尚未冻结，属于R03。

文档归属不代替成员授权。每次历史列表、详情、原件和打印，都从该release持久化scope校验哈希和身份，再复用真实账号/全成员/实际实验组授权。历史原件以该版完整成员为准，不换成未来文档当前成员。无scope、损坏scope、患者/文档不符、重复成员均明确拒绝，不依据当前页面或逗号分隔申请号猜历史。

原件必须来自数据库既存PDF，读取前核对SHA256，不重新渲染。`ISSUED`、`SUPERSEDED`、`VOIDED`可以查看原件；DRAFT、缺原件或哈希损坏不可下载。页面详情给出实时 `canReviewOriginal` / `canPrintCurrent`，下载/打印时仍重新核验，不能把详情按钮状态当作永久许可。

正式打印只接受该文档当前ISSUED版本。服务器按“父文档→release”顺序加写锁、刷新release，拿锁后重核完整成员权限、状态、当前版本和PDF哈希，再更新打印请求计数。模拟验证覆盖等待锁期间撤权、作废/替代和成员变更。

打印计数表示服务器已接受并返回该版PDF的打印请求，不证明浏览器或实体打印机已出纸。历史原件在浏览器/PDF阅读器内仍可能被另行打印；这里保证正式打印接口与记账仅针对当前有效版本。

## HTTP 契约

前缀 `/rest/reports`，临床报告文档/原件/打印要求REPORTS并通过服务层完整成员授权。

| 方法及路径 | 响应/行为 |
| --- | --- |
| GET `/documents/{documentId}/releases` | 文档历史release摘要；任一历史成员证据不完整/越权时整次拒绝，避免隐式部分报告 |
| GET `/documents/{documentId}/releases/{releaseId}` | `{release, scope, canReviewOriginal, canPrintCurrent}` |
| GET `/documents/{documentId}/releases/{releaseId}.pdf` | 已存PDF原件，必须属于路径文档；不会增加打印计数 |
| POST `/documents/{documentId}/releases/{releaseId}/print` | 当前有效原件并记一次打印请求；其它状态409 |

旧患者结果JSON与PDF预览还保留为患者图表用途，其结果先以analysisId完整查回实际Analysis，再按实际Analysis.testSection及RESULTS科室权限过滤；不信任项目目录默认科室。缺失分析身份或批量查询不完整时拒绝，缺实际科室的分析不可见。模拟使用真实UserServiceImpl科室过滤实现验证反向默认科室、缺失科室和不完整证据。

旧 `/patient-results/releases/{releaseId}.pdf`、`.../print` 调用同一服务并传当前actor，无独立放行逻辑。旧患者级草稿/历史查询仍按R01要求拒绝；issue/void保持 `REPORT_FROZEN_SIGNATURE_REQUIRED` 等待R03。

PDF响应包括：`X-Report-Type=CURRENT_ORIGINAL/HISTORICAL_ORIGINAL`、`X-Report-Status`、`X-Report-Current`、`X-Report-Document`、`X-Report-SHA256`。只有正式打印请求包含 `X-Report-Print-Audit=recorded`。所有报告响应设置 `Cache-Control: no-store, private`；PDF含nosniff。完整成员JSON、PDF字节不会随实体普通JSON响应泄露；详情只显式投影已授权scope。

## 迁移和边界

086只追加`member_scope_json`、`member_scope_sha256`和配对约束。历史两者为NULL保持原样且不可进行新报告业务操作。有任一成员证据即拒绝回退删除列。迁移XSD/结构、ORM映射与服务模拟验证不代替真实PostgreSQL迁移、锁竞争及回退测试。

本批不实现医院真实权限配置、实体打印机联调，也不宣称签发、更正、签名完整闭环完成。R03继续冻结临床内容并复用W03内容签名；R04对接文档选择/历史/原件界面以及明确的配置版本和更正策略。

## 验证

相关Java服务、HTTP契约、ORM、迁移结构、历史原件字节与哈希、打印权限/竞态为SIM或隔离单元测试。16个相关测试类共218项全部通过，失败/错误/跳过均为0（包含真实科室过滤实现的4项预览边界测试）。Java 21离线完整clean install另行执行，构建命令跳过测试；上述单测先独立完成，XML已归档。20个本批Java文件的Spotless命中数已核对。完整构建结果以本批封存清单及full-build.log为准。
