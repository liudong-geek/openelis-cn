# R01：申请/报告组归属与文档内版本

日期：2026-09-16。独立开发基线：`353737762`；主候选合入基线：`d278c2a10`。本批为可配置服务端实现和 SIM/隔离单元验证；未使用医院真实规则、患者、仪器或正式签章。

## 业务变化

正式报告准备先选择持久化申请 `sampleId` 和服务器配置的 `groupKey`。服务器读取该申请全部分析任务，按配置的 testId 集合选出完整成员，并复用 `ReportAnalysisAuthorizationService.authorizeExplicitScope` 对真实账号、申请患者、实管及实际实验组做完整授权。浏览器不传入成员清单。未配置、空组、未知组、越权成员均拒绝。

同一 `sampleId + groupKey` 只生成一个 `ReportDocument` 和稳定报告编号。成员按持久化 analysisId 排序；创建时保存成员，重复准备复用文档。后续增删任务、变更规则版本不会静默改动旧文档：准备返回409，旧成员保留。修改分组后的既有文档如何重组属于后续显式更正流程，当前没有自动重组。

沿用 `PatientReportRelease`，增加可空 `report_document_id`：新草稿必须归属明确文档，草稿、版本、补充/更正上版关系均按文档查找，创建草稿前锁定父文档。同患者另一申请/组可以独立从V1开始。报告编号属于文档，各版复用编号。原记录保留为空，不能从患者ID或逗号分隔申请号猜成员和归属。

## HTTP 契约

所有文档操作要求REPORTS；配置修改要求ADMIN。服务端成员权限仍逐次检查，页面角色不构成持续授权。

| 方法与路径（前缀 `/rest/reports`） | 请求/响应 |
| --- | --- |
| GET `/group-rules` | `{ruleVersion, groups:[{key,label,testIds}]}`；尚未配置返回409 |
| PUT `/group-rules` | `{expectedRuleVersion:null或旧版本,groups:[{key,label,testIds}]}`；验证目录testId存在，服务器分配新UUID版本；不符旧版本409 |
| POST `/documents` | `{sampleId,groupKey}`；返回下述文档投影 |
| GET `/documents?sampleId=...` | 该申请已有文档；任何文档完整权限不符则整次拒绝 |
| GET `/documents/{documentId}` | 文档投影 |
| GET `/documents/{documentId}/releases` | 明确文档内的release摘要 |
| POST `/patient-results/releases/drafts` | `{documentId,amendmentReason}`；旧patientId请求拒绝409 |

文档投影：`{id,patientId,sampleId,groupKey,ruleVersion,reportNumber,lastUpdated,analysisIds}`。release摘要新增`documentId`。

配置保存在既有 `report_definition` 固定记录 `lis-patient-group-rules`，reportType为`PATIENT_GROUPS`，使用既有Hibernate版本防止并发覆盖。key只允许字母数字及`_.-`，最多128字符；规则最多100组，每组最多2000个唯一testId。重叠组只有显式配置才能出现，不根据项目默认科室或患者历史自动猜分组。

## 旧入口与阶段边界

- 患者级草稿和历史release接口明确拒绝；用户需先选文档。
- 已有PDF读取/打印先校验文档全成员及release患者/编号归属；未建立成员证据的历史release返回`LEGACY_REPORT_MEMBERSHIP_UNVERIFIED`。
- 旧 `issue` 重新查询患者实时结果的实现已移除。文档归属验证后，签发/作废暂返回`REPORT_FROZEN_SIGNATURE_REQUIRED`。R03完成冻结内容与版本签名后才启用，不使用旧签名接口静默绕过。
- 本批不宣称签发、更正执行、历史PDF完整查阅、前端工作台或临床报告闭环完成；R02–R04继续接续。

## 迁移

注册原081文档/成员迁移，085仅为既有release增加document关联及约束调整。旧数据不回填、不删改。新文档版本、一个活动草稿、一个当前ISSUED均有数据库唯一约束；历史未关联行保留患者版本、编号、活动草稿的部分唯一约束。085回退遇到任何文档关联release时拒绝，081回退遇到任何文档/成员时拒绝，避免删除历史。

081、085仅完成离线XSD和结构验证，本批未执行PostgreSQL迁移、回退、真并发或生产库兼容验证。上线前必须在隔离PostgreSQL以空库和代表性历史数据完成这些验证。

## 验证证据

- Java21生产源码编译通过；完整 `clean install -DskipTests -Dmaven.test.skip=true` 构建通过（1分49秒）。该构建跳过测试，186项回归为独立执行的结果。
- 23个相关Java文件已按项目Spotless格式检查/整理；本批未修改前端。
- 首次60项服务、配置、映射和081结构测试通过，无失败/跳过。
- 最终186项回归通过（0失败、0错误、0跳过）：覆盖HTTP契约、085结构、既有真实账号/全成员授权和中文PDF渲染器。
- 使用模拟持久化ID覆盖：同患者多申请独立V1、重复准备、成员增加/规则变化409、权限撤销、旧患者接口阻断、旧未关联PDF阻断、草稿更正原因与上版关系。
- MockMvc为HTTP合约测试；临床授权的真实实现由既有授权测试覆盖。未运行依赖Docker/PostgreSQL的完整Spring环境测试。

## 主候选融合复测

- 与已提交W03融合后，完整Java21 clean install通过（118.62秒），186项报告回归独立复测通过（0失败/错误/跳过）。
- 27项报告变更逐文件对照封存源码，除保留W03的base.xml迁移注册和本验收补记外一致；原项目另有导航迁移注册，通过三方融合保留在工作树中。
- 本批不改前端；后续R04接通实际报告工作台。PostgreSQL演练仍由O01隔离模拟运行环境补齐。

## 后续最小接续

R02建立release冻结成员明细/权限证据和历史查阅投影；R03在现有release冻结结果、患者/申请元数据及模板版本，准备哈希和签名上下文，事务内复核后渲染同一冻结内容；R04接通文档选择工作台、更正链与历史原件、当前有效打印，并更新旧入口。
