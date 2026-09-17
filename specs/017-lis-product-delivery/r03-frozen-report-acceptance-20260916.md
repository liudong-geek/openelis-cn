# R03：冻结报告、内容签名与更正版本

日期：2026-09-16。独立候选 `.work/openelis-r03`，增量基线 `.work/r03-start-snapshot`（已含R01、W03、R02），不重复计入前批源码。不在原仓库提交；由主任务验收融合后按批提交。

## 业务闭环

按服务器配置创建报告文档和完整成员草稿后，操作者明确冻结当前内容，预览冻结版本，再输入当前操作者密码签发。签发请求必须携带刚审阅的snapshotSha256；客户端不选择签发人、analysis成员或既有signatureId。服务在同一个Spring事务内重新核成员、来源状态/版本/显示内容与权限，调用W03 `executeSignatureForSnapshot`，生成并保存PDF、签名关联和版本状态。旧“先generic签名、再传signatureId签发/作废”入口保持明确拒绝。

冻结内容包括文档/患者/申请/分组规则身份、报告编号与版本、更正原因、中文A4模板版本/标题/机构标识/页脚、全部患者与标本显示字段、项目结果/单位/参考范围/提示/方法/检验人员/备注，以及每个分析和每条结果的持久版本与原始值证据。复用现有结果显示映射，使用完整A4所需字段；旧患者自定义表格列不会使正式PDF丢失必需表头字段。每个完整成员均须已审核并至少有一项非空可报告结果；缺成员、缺版本、结果映射遗漏/重复或身份不符均阻断。

草稿可重新冻结；刷新后哈希变化会使旧预览签发请求失效。签发时只把已保存的冻结内容传给内容签名并用于PDF，不把现场新查询悄悄替换进原预览。签发人打印姓名、签发时刻取此次签名的持久记录；之后姓名更改不改历史摘要与PDF。预览与正式PDF使用同一冻结模板及临床内容，区别为签发状态、人名和时间。备注和更正原因在两者均显示。

报告更正继续同一文档编号，版本递增、必须有原因。新版本成功签发后只替代同一文档的前版，原PDF及内容快照保留。作废必须是当前有效版本，携带原PDF哈希、密码和原因；同事务签署包含documentId/releaseId/version/snapshotSha256/pdfSha256/原因的VOID_REPORT内容，原件字节不变。失败和过期请求不产生新有效版本。打印仍仅当前有效报告，历史原件可审阅，打印计数不证明实体打印机出纸。

## 分组规则与科室选择

新文档在创建时冻结当时完整分组配置JSON及SHA256。全局配置修改只影响新文档，旧文档后续草稿/更正按自身原规则核完整成员，不因全局ruleVersion不同整体停摆。原分组的申请成员发生变化时明确冲突；采用显式新groupKey建立新分组文档，不能静默改旧文档成员。旧无规则证据文档不会猜测补齐；已有原件的读取仍受R02历史证据规则约束。

申请选择使用规范patientPK，返回持久sampleId及申请号。按完整已授权分组/文档筛选：同一申请有生化与血常规而操作者只有生化权限时，申请和完整生化文档仍可见，不暴露无权文档ID/摘要。单份报告成员永不截断，直接访问无权文档继续403。列表开始和结束检查同一当前账号、角色与会话；只有科室权限不足返回不可见，缺失/损坏的归属与成员证据或查询错误会让请求失败，不伪装成空列表。

## HTTP 契约

前缀 `/rest/reports`。临床入口统一REPORTS与服务层当前账号/完整成员权限。所有响应不缓存；密码字段只读入、不序列化、不出现在DTO.toString中。

| 方法及路径 | 输入/响应 |
| --- | --- |
| GET `/applications?patientId={patientPK}` | `[{patientId,sampleId,accessionNumber}]`；不接受FHIR别名代替数据库PK |
| POST `/documents/{doc}/releases` | `{amendmentReason?}` → 既有release摘要 |
| POST `/documents/{doc}/releases/{id}/freeze` | 无成员输入 → FrozenResponse |
| GET `/documents/{doc}/releases/{id}/snapshot` | FrozenResponse，读取持久内容，不重新采集 |
| GET `/documents/{doc}/releases/{id}/preview.pdf` | 仅草稿冻结预览，X-Report-Type=FROZEN_PREVIEW，不记打印 |
| POST `/documents/{doc}/releases/{id}/issue` | `{snapshotSha256,password}` → release摘要 |
| POST `/documents/{doc}/releases/{id}/void` | `{expectedPdfSha256,password,reason}` → release摘要 |

FrozenResponse：`{releaseId,documentId,snapshotSha256,frozenAt,snapshot}`，SHA256为小写64位十六进制。snapshot含`{schemaVersion,scope,reportNumber,reportVersion,amendmentReason,template,report,analyses}`；report沿用ReportingData `{columns:[{key,header,type}],rows:[{cells,dataMap}],message}`。analyses为`[{analysisId,lastUpdated,statusId,testId,sampleItemId,sectionId,results:[{resultId,lastUpdated,value,resultType,reportable,minimum,maximum,analyteId,testResultId,parentResultId}]}]`；版本时间为UTC Instant字符串。400=INVALID_REPORT_REQUEST，409=REPORT_STATE_CONFLICT，拒绝越权为403。

## 迁移与验证范围

087追加文档分组证据、release冻结内容/哈希/时间与打印姓名列，保留旧数据NULL，不回填或伪造历史签名。回退遇任何新证据即拒绝删除列。临床读取锁定申请、标本、分析、结果与主要患者/送检/医生/项目元数据，锁后复核scope和来源；文档/释放锁顺序保持R02父文档→release，来源锁在其后。前版状态更新先flush，再将新草稿改为ISSUED，以满足每文档唯一当前有效版本约束。

本批使用SIM数据与隔离单元/HTTP/ORM/Liquibase XSD验证，并以实际Spring事务拦截器验证渲染异常走rollback，及既有内容签名传播级别REQUIRED。隔离PostgreSQL 14.24已真实执行到851个变更集：087执行一次，重复迁移不新增记录；新增6个字段和2个检查约束存在。可回滚合成数据验证了不完整分组/冻结证据被约束拒绝、双ISSUED被唯一索引拒绝、旧版先SUPERSEDED并flush后新版ISSUED成功，以及第二事务在文档→release锁顺序上超时。验证结束后合成行清零、Liquibase锁释放。

最终20类318项报告域回归通过，失败/错误/跳过0；R03涉及源码定向Spotless检查通过，Java21完整`clean install`在跳过测试打包模式下3分完成，测试已单独执行并保存XML。一个既有`PatientReportRestControllerTest`需要Docker，本机无Docker，未计入通过数；全仓Spotless仍被3个本批未修改的历史XML格式问题阻挡。本批不改变医院审批规则，不代表院方样张、真实签章/打印、多岗位或临床上线验收。
