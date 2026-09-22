# A-01 模型与岗位合同核查补充

日期：2026-09-23。固定需求：A-01；下批输入：A-02、A-03，以及 B/C/D 对应既有批次。状态：**已补当前源码证据，未关闭 A-01，未执行后台测试或医院验收。**

## 核查来源与结论

本稿针对已恢复并核对的正式提交 `a52cafa4f5c87b2016fd9a325d857ae3bb517d94`。文中源文件及测试定义与该提交的逐文件 Git blob 对照记录在同目录 `a01-model-contract-source-check.json`。53 个当前文件与该提交一致；F2 在核查过程中由主任务增加上下文类型断言/注释，本稿已改用固定 Git blob 摘取固定提交的 `frontend/src/components/resultPage/unified/UnifiedResults.tsx` 的行号，54 份引用证据全部与固定提交一致。不把原 Documents 云占位文件、未提交的 App/session 等变更或恢复产物当成这一版本。本次仅阅读、写核查文档，没有修改业务代码、数据库、容器或总台账。

本稿补充此前运行包核查的后台待核项；本仓库文档以本次 54 份固定提交证据为准。现在能确认：系统已有申请与待采请求分离、实管签收、首次验收、逐 analysis 结果准入、受控审核、按申请分组的报告文档与冻结版本。后续应完善贯通和可理解的界面，不能把这些能力重新造一套。**岗位名称、兼岗、自审/二审、代录、部分报告、危急值关闭等医院制度仍未提供。**

四处尤其需要保持准确：采集人自由文本与真实保存人不同；签收时间是经后台校验的输入事实，验收时间由后台产生；审核释放 analysis 与签发报告文档是不同事件；首页的旧指标目前与实际工作队列范围、状态及计数单位不一致。

## 1. 实际身份链

| 对象           | 当前持久关联与核查结论                                                                                                                                                                                                                                                                                                 | 证据                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 患者/个人资料  | `Patient.person → Person`；患者内部 ID 与 nationalId/externalId 分开。`SampleHuman` 保存 sampleId、patientId、providerId；本轮收验服务要求临床申请恰有与命令一致的患者关联。不能用显示姓名或证件号代替内部身份。                                                                                                       | M1:16–24；M2:17–32；S2:73–85                    |
| 就诊/申请      | `Sample.id` 是申请持久键，accessionNumber 是查询号，另有 referringId/clinicalOrderId。**本次主流程未查到独立就诊对象贯穿收验、结果、报告的合同；这不等于全仓没有就诊能力。** HIS 就诊号、外部申请号的唯一域、重发/补录规则仍待接口核对，不擅自拿 labNo 充当就诊号。                                                    | E1:37–64；S4:140–156                            |
| 待采请求       | `SampleTypeRequest.sample`、类型、数量/单位、项目/组合、REQUESTED/COLLECTED/CANCELLED、可空 sampleItem。申请已保存不等于已产生实管。                                                                                                                                                                                   | E2:43–91                                        |
| 实管           | `SampleItem.sample → Sample`；自身有 id/externalId/sortOrder、collector、collectionDate、receivedDate、rejected/voided、lastupdated。另有父管和子分装关系，不能把当前普通收验合同“一请求一目标实管”推广为全系统禁止分装。                                                                                              | M3:17–34、59–103；E3:36–94                      |
| 检验任务/结果  | `Analysis.sampleItem → SampleItem`，并关联 test/testSection；`Result.analysis → Analysis`，另有 analyte、testResult、parentResult；均有版本。analysisId 是具体任务，testId 是定义，组件行/result 数不等于 analysis 数。旧 ResultSignature 按 resultId 记录；本轮审核内容签名另以 ANALYSIS 绑定，不能混成统一签名粒度。 | M4:15–42；M5:16–33、58–61；E4:22–26；S8:117–128 |
| 报告文档与版本 | `ReportDocument` 固定 patientId/sampleId/groupKey/ruleVersion；文档成员为 analysisId 集合。唯一域是 sampleId+groupKey，报告号单独唯一。`PatientReportRelease` 保存 documentId、文档内版本、冻结成员及摘要、冻结内容及摘要、原 PDF 及摘要、签发/作废/前版关联。版本与患者/申请/管/analysis 不是同一种对象。             | E5:35–106；E6:22–54；E7:37–132                  |
| 报告并发约束   | 迁移定义 `(documentId, reportVersion)` 唯一，以及每文档最多一个 DRAFT、一个 ISSUED；旧未归属版本保留不同约束。**定义存在不证明当前数据库已应用。** 服务对没有冻结成员依据的旧版拒绝绕过文档授权。                                                                                                                      | M6:19–28；S11:334–397                           |

## 2. 规则表一：岗位权限与可信操作人

这是代码能力表，不是医院岗位制度。不能按菜单可见判断接口授权，也不能推定“管理员自动能做所有岗位”。

| 环节                                | 已有后台保护                                                                                                                                                                                                                              | 仍需验证/医院待定                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次登记、采集、签收、首次验收/补采 | 明确流程使用 `OrderEntryActorGuard`：从当前认证主体解析唯一、启用的数据库用户；检查 Reception/Global Admin、真实会话及当前权限来源；本地登录额外校验账户、数据库角色；事务提交前复核身份。采收验另查目标全部项目的 Reception 专业组授权。 | 旧 `saveEntry` 在 requestedSpecimens 为空时仍走 `ControllerUtills`，不能声称全旧入口已统一。HIS/手工录入、代录及兼岗制度待定。S1:78–170；S2:160–194、212–220；S3:468–476；S5:187–203、710–718。                                         |
| 结果录入                            | REST 要求 Results；服务按锁定 analysis 的实际专业组过滤；请求的 analysisId、sampleItemId、申请号和版本必须一致，事务前后复核。                                                                                                            | 结果 actor 仍来自 `ControllerUtills`，并检查同一 session/userId，**不是直接复用登记的严格主体绑定**。需要补跨身份异常会话、所有旧结果入口的针对性回归，再决定是否统一保护。S6:97–132、155–182；U1:13–32。                               |
| 审核/退回                           | 查询上下文绑定用户、查询条件、分页与版本；只从客户端接收审核选择/原因，使用服务端缓存的结果值。写入重新查 Validation 专业组、完整组件结果、版本、当前验收与质控闸门。电子签名启用时要求当前用户认证，并绑定每个 analysis 的内容。         | 自审/二审、审核岗位独立性、专业组覆盖范围由院方确定；本轮没有证明自审隔离已经配置。审核采用 session/userId 检查，与登记主体绑定强度需进一步对照。S7:109–163；S8:90–138；S9:56–141、203–237。                                            |
| 报告管理/签发/历史                  | 文档控制器要求 Reports；组规则写入要求 Admin。报告授权将 actor 反查到当前认证主体及启用用户，对完整 analysis 集合按 Reports 专业组授权；列表可省略整个无权分组，不能删掉无权成员再拼半份报告。历史按冻结成员重新授权。                    | 组规则、报告模板审批、CA/电子签章、自审/签发人分工、部分发布制度仍待院方。现有普通冻结服务要求每个成员均 Finalized 且有可报告结果；不擅自改为部分发布。S10:57–104、196–213；S12:142–177、208–238、253–295；S13:61–103；C2:28、110–118。 |

## 3. 规则表二：状态与允许动作

| 状态/事实                   | 已有允许动作与边界                                                                                                                                                                                       | 证据                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 申请 REQUESTED 请求尚未采集 | 采集服务校验申请 Entered/Started、原请求、项目及权限；持久采集后更新实管/请求，已提交采集重试不改旧时间或审计字段。不能借采集保存重写整份患者/申请资料。                                                 | S5:463–491、628–670         |
| 已采未签收                  | 签收锁申请、请求、实管、analysis；要求临床患者、请求归属和类型一致、非分装父子替代、非拒收/作废、SampleEntered、Not Tested。只写已明确管的 receivedDate；精确相同已签收事实为零写重放，不同时间冲突。    | S2:63–195                   |
| 已签收、尚无首次验收        | 首次决定服务使用 SERIALIZABLE，核完整锁定事实和 expectedEvidenceDigest、字典版本、审计配置、用户和项目权限；拒收冻结原因并更新拒收事实。只有相同 operationId/内容/操作者可以重放；不能覆盖另一首次决定。 | S3:79–200、333–374、452–476 |
| 历史 ACCEPTED → 当前准入    | 当前患者、请求、管、采集/签收、管/请求版本及原分析集合仍须匹配。结果保存正常推进 Sample/Analysis 版本不抹掉验收；新增反射/计算 analysis 不能借原验收获得自身录入权。                                     | S14:23–94                   |
| 普通结果录入                | 写前锁实管再锁 analysis，检查当前准入；已发布、已打印或 Finalized 锁定。NotStarted、TechnicalAcceptance、BiologistRejected 可按普通录入政策处理；返回的生物审核退回可重新录入。                          | S15:36–156；S16:50–68       |
| 审核通过/退回               | 审核前复核全部所选 analysis 的结果证据、验收、权限、QC；通过置 Finalized 并生成服务端 releasedDate，退回置 BiologistRejected、releasedDate 为空。提交前读回复核；外部通知在提交后运行。                  | S8:90–211；S9:56–157        |
| 报告 DRAFT→冻结→ISSUED      | 冻结所有成员、结果版本、临床显示与模板；签发校验预览 hash、重新锁定捕获源内容、前版关系，签名/PDF/状态同事务。新 ISSUED 使旧版 SUPERSEDED；作废需要当前版原 PDF hash、理由与签名；原字节保留。           | S11:58–218；S13:41–108      |
| 历史版本/打印               | ISSUED/SUPERSEDED/VOIDED 可按原件完整性与权限读取；只有当前 ISSUED 可记录打印。打印接口记录的是取原件并计数的动作，**不是打印机已经出纸的硬件回执**，且不能凭别人增加的计数推断本次未知请求成功。        | S11:297–331、400–426        |

## 4. 规则表三：默认字段和事实来源

| 字段                                                                  | 权威来源与当前行为                                                                                                                                  | 后续填写优化边界                                                                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| patient/sample/request/sampleItem/analysis/result/document/release ID | 数据库关联与服务端读回；不能由显示行序号、姓名或条码拼接代替。current 投影要求完整申请授权。                                                        | UI 带入且只读展示关键身份；跨环节携带真实 ID 后重新查询。S4:133–161、248–281。                                                   |
| 申请日期及候选字典                                                    | 原前端 `/rest/SamplePatientEntry` 读取 currentDate、机构/医生/地点/优先级等候选；current 主数据由后台同一只读事务取已引用类型/项目/组合/单位/状态。 | 搜索选择优先；不能把服务器默认日期当“已经采集/签收”。字典治理、科室/病区/HIS 外部映射仍待医院。S4:286–315；F1:2165–2196。        |
| 日期格式、实验室时区/现在                                             | DEFAULT_DATE_LOCALE 推导显示格式；current 使用 **JVM 默认时区** 与服务端 now，不是浏览器时区。                                                      | 部署必须核查 JVM 时区与医院一致；没有验证该运行配置前不宣称已统一北京时间。S4:305–315。                                          |
| 采集人/采集时间                                                       | collector 是采集输入并落入实管；currentUserId 是可信保存/审计操作人。显式采集时间不能晚于服务器当前时间，已采事实不能被重复保存改写。               | 目前不能声称采集人已全部采用受控人员下拉；真实采集人、代录人、执行时间、录入时间不可混用。S5:653–664、751–779。                  |
| 签收人/时间                                                           | receivedDate 取命令，经时间与原采集事实检查；sysUserId 取严格绑定 actor 并走审计服务。实管没有由本次证据证明独立 receivedBy 字段。                  | UI 可以默认现在，但必须明确实际事实；若要展示签收人，复用可追溯审计或明确事件投影，不凭前端当前用户补历史。S2:114–126、173–194。 |
| 验收人/时间/拒收原因                                                  | 决定使用 actor.userId + Clock.systemUTC；拒收原因用当前字典 ID/lastupdated/文本冻结；输入证据摘要与锁定事实一致。                                   | 原因搜索选择；字典无效/空不得伪造默认“合格”或随意原因。S3:143–189。                                                              |
| 审核/签发及打印时间                                                   | 审核释放时间由后台时钟；报告签发/作废时间取内容签名 signedAt；草稿/冻结/打印审计时间由服务端 Instant.now。                                          | 切勿用本地按钮点击时间当服务器完成时间。S8:154–159；S11:85–86、103–105、172–178、211–216、325–328。                              |

## 5. 规则表四：异常交接

| 异常                               | 当前有依据的处理能力                                                                                                           | 未闭合部分及归属                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 首次登记保存响应丢失               | key+actor+请求摘要的持久回执；独立 REQUIRES_NEW/REPEATABLE_READ 查询旧回执及当前状态；缺记录明确“可能仍在处理”，不自动重开单。 | 同候选合成测试验证真正提交后丢响应、重试零重复；仍属 A-03/C 对应场景。S17:55–148。                                                  |
| 签收已存在/时间冲突                | 精确同事实可重放；不同收到时间 409，不覆盖。                                                                                   | 一个批次多管不满足时的整体回滚及操作提示需运行验证，不声称部分成功。S2:155–195；T2:252–274。                                        |
| 首次验收拒收后补采                 | 已有补采服务：保留原拒收管与决定，另建 REQUESTED 且 sampleItem 为空的替代请求，保存来源/回执、同 operation/source 防重和审计。 | 不是删旧管改状态；补采的角色交接、扫码指引和院方通知制度未验收。S18:77–144；T4:209–276。                                            |
| 权限撤回、身份变化、事实/版本变化  | 收验、结果、审核、报告写前/提交前或锁后分别重新验证；失配拒绝，不把历史通过当当前授权。                                        | 严格主体绑定与旧 session helper 尚不一致；需有界跨身份/旧入口回归后判断真实缺口。不能笼统宣称全系统已修完。S1/S6/S7/S9/S12。        |
| 同管部分项目可录、新增项目无旧验收 | 准入按 analysis 判断，原正常项目与新增不允许项目分开；当前验收证据保留。                                                       | A-03 做清晰原因、可达处理入口和岗位提示，避免把整管无理由一刀切或把受阻项目当可处理总量。S14:74–94。                                |
| 审核退回/QC 阻断                   | 退回原因、签名及内部审核审计已有；QC 在审核前与提交前重查；退回进入 pending 来源状态。                                         | QC 规则、处理职责、自审/二审由医院定；是否所有拒收/QC 理由都有明确可达入口仍需页面验证。S8:103–128、184–211；S19:33–49。            |
| 报告源变化/更正/作废/旧版无依据    | 预览源变化必须再冻结核对；更正保留前版及理由，作废保留原件；旧版没有成员证明不能用患者级查询绕过。                             | D-02 继续核旧数据迁移与模板/分组变更、真实并发及未知签发/打印，不重做已存在的版本模型。S10:196–213、252–278；S11:132–218、379–397。 |
| HIS 回传、仪器、危急值临床关闭     | 本轮只查结果/审核提交后副作用调用，未查其完整消息生命周期。                                                                    | 保留 D/E 范围；有调用不等于外部成功，真实接口/接收人/超时升级仍外部待验收。C1:173–196；S8:215 起。                                  |

## 6. A-02 最小开发输入：复用真实队列，修正范围和单位

本节是固定 A-02 的具体实现缺口，不增加新的总计划或关闭条件。

| 已证实差异                                                                                                                                                                                                  | 应做的最小修改                                                                                                                                                            | 验收要点                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首页 `ordersInProgress` 只按全局 NotStarted analysis 计数，没有当前用户/专业组条件；DAO HQL 仅筛 status。结果 pending 已按 NotStarted+BiologistRejected、排除 released/printed，再过滤当前 Results 专业组。 | 从当前结果工作队列服务提取共同的授权、状态、准入查询合同，用于首页结果任务与目标队列；不另写一套仅按状态 count。现有 controller 注释“与首页完全相同”已经过时，应更正。    | 两个不同专业组用户；NotStarted、BiologistRejected、已发布/已打印；无权/没有任务；卡片和目标队列在同一范围逐 ID 对账。H1:312–320；H2:1775–1782；S19:33–49。 |
| pending API 的 `total` 是展开后 TestResultItem 行数；首页旧 count 是 analysis 数；首页又把电子申请、检验项、审核项、未打印项直接相加成“待处理”。                                                            | 明确单位，analysisId 去重统计检验任务，sampleItemId 去重统计实管；可录和受阻显式分开。保留现有总字段兼容，新增计数说明/字段由实现定；不把跨业务不同单位相加成一种任务数。 | 一 analysis 多组件、多选结果、多 analysis 同管、同患者多申请；可录/受阻分别可解释。不重复计行，不丢受阻记录。C1:128–137；F2:485–504；H3:733–741。          |
| 首页面向审核的 count 仅 TechnicalAcceptance；审核查询还可由配置包含 TechnicalRejected，并按 Validation 专业组、完整查询上下文处理。                                                                         | 以现有审核查询/状态规则提供同范围摘要；入口继承已存在的 queryId/分页/版本合同，不能给首页按钮直接写审核状态。                                                             | 开关前后、专业组不同、QC 阻断、分页、并发/权限变更；“待审核”与“当前允许通过”需分别解释。H1:317–320；C3:153–208；S7/S9。                                    |
| “未打印报告”实际是今日 Finalized analysis 中 `patientReportHasBeenDone=false` 的条目，不能代表 ISSUED 文档版本数。                                                                                          | A-02 先正确标注旧指标语义；如作为报告待办，应复用文档/版本授权统计及匹配入口，并与 D-02 协同。不提前更换报告模型或凭 analysis 推定报告已发。                              | 同文档多 analysis、同患者多文档、旧版/作废/更正后当前版、跨日未处理；报表数与检验项数不能混用。H1:169–182、349–350；S11:297–331。                          |
| 首页 loadCount 接收任意 object 后与 EMPTY_COUNTS 合并；初始值为 0，缺字段可能显示“0”，且顶部混加。                                                                                                          | 对必需数字和已加载/不可用状态明确校验；失败、401/403、缺字段不能冒充零任务；刷新失败保留“上次成功数据”标识或显示不可用。                                                  | 首次失败、空合法结果、部分字段缺失、负数/错误类型、刷新失败、身份改变的旧响应。H3:104–115、250–264、733–741。                                              |

**无需重做的能力：** 首页已有 `/Results?scope=pending`、申请号直达；结果页无筛选自动取 `/rest/results-entry/pending`，有申请号/专业组/日期改取原 `LogbookResults`，保留 URL 查询，route gate 保留旧地址参数。A-02 要测试并收敛筛选语义，不能重新报“尚未实现自动加载”。筛选后使用另一查询服务，是否与 pending 的状态范围完全一致仍是下一批必须对账的具体合同。H3:117–129、410–445；F2:518–551、600–636；F3:25–75。

此外，旧 `/rest/home-dashboard/{listType}` 先装载列表再走会话分页，当前读取代码未见按真实 actor/专业组过滤；前端只靠 testSection 展示筛选不构成对象权限。A-02 应连同卡片摘要一起核查并复用授权查询，不能只改显示数字后保留未核旧下钻入口。H1:185–207、377–401、416–422。本稿未做无权用户的运行请求验证，不将它直接写成已复现安全事故。

## 7. 现有测试定义与本轮验证边界

本轮只阅读下列相关测试定义及源逻辑，没有运行 Maven、数据库测试、浏览器医疗写操作或部署；下表不是通过报告。实现下一批前按影响选择既有测试并实际执行，再补正常、空、失败、无权、版本冲突及未知提交的同候选场景。

| 定义证据                | 已有场景，可直接复用                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| T1:93–186               | 当前本地/SSO 身份、错误会话/权限来源、提交前变化、管理员仍需真实角色  |
| T2:232–320              | 明确管签收、精确重放零写、不可覆盖、缺版本/未来时间/错误患者等拒绝    |
| T3:353–478              | 单管首次接受/拒收、另一管不受影响、字典/依据、原历史保留、防重        |
| T4:209–276              | 新建未采替代请求、不改拒收源管、精确重试、权限/审计失败与回滚         |
| T5:47–171               | 旧验收不可借给新 analysis，患者/请求/管版本变化，重复/坏依据关闭      |
| T6:40–69                | 结果工作队列专业组过滤、审核退回重新进入、已发布/打印排除             |
| T7:111–220；T8:148–247  | 内容签名、退回理由、提交后副作用、组件完整性、专业组/版本再校验       |
| T9:68–200；T10:49–143   | 报告完整分组、同患者不同申请/文档隔离、固定成员、每文档版本及历史授权 |
| T11:105–295；T12:73–155 | 冻结快照、源变/旧 hash、错误文档、原件/签名事务、缺成员/空可报告结果  |

A-01 仍需关闭的公共合同：原有患者/就诊与 HIS 号来源、旧写入口与严格身份检查的一致性、当前数据库迁移和时区、同候选真实模拟验证，以及四表中的产品入口/责任提示。缺医院制度继续标待定，不阻止已有可配置能力和合成验证，但不能把模拟结论写成医院验收。

## 证据索引

以下路径相对本稿固定源码根；表中的 `编号:行号` 指向这些文件。行号与 blob 版本一起使用。

| 编号 | 仓库相对路径                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| M1   | `src/main/resources/hibernate/hbm/Patient.hbm.xml`                                                         |
| M2   | `src/main/resources/hibernate/hbm/SampleHuman.hbm.xml`                                                     |
| M3   | `src/main/resources/hibernate/hbm/SampleItem.hbm.xml`                                                      |
| M4   | `src/main/resources/hibernate/hbm/Analysis.hbm.xml`                                                        |
| M5   | `src/main/resources/hibernate/hbm/Result.hbm.xml`                                                          |
| M6   | `src/main/resources/liquibase/3.5.x.x/085-report-document-release-scope.xml`                               |
| E1   | `src/main/java/org/openelisglobal/sample/valueholder/Sample.java`                                          |
| E2   | `src/main/java/org/openelisglobal/sampletyperequest/valueholder/SampleTypeRequest.java`                    |
| E3   | `src/main/java/org/openelisglobal/sampleitem/valueholder/SampleItem.java`                                  |
| E4   | `src/main/java/org/openelisglobal/result/valueholder/ResultSignature.java`                                 |
| E5   | `src/main/java/org/openelisglobal/report/valueholder/ReportDocument.java`                                  |
| E6   | `src/main/java/org/openelisglobal/report/valueholder/ReportDocumentMember.java`                            |
| E7   | `src/main/java/org/openelisglobal/report/valueholder/PatientReportRelease.java`                            |
| S1   | `src/main/java/org/openelisglobal/sample/service/OrderEntryActorGuard.java`                                |
| S2   | `src/main/java/org/openelisglobal/sample/service/SpecimenReceiptService.java`                              |
| S3   | `src/main/java/org/openelisglobal/sample/service/SpecimenIntakeDecisionService.java`                       |
| S4   | `src/main/java/org/openelisglobal/sample/service/EntryCurrentStateReader.java`                             |
| S5   | `src/main/java/org/openelisglobal/sample/service/SamplePatientEntryServiceImpl.java`                       |
| S6   | `src/main/java/org/openelisglobal/result/service/LogbookPersistServiceImpl.java`                           |
| S7   | `src/main/java/org/openelisglobal/resultvalidation/service/ReviewQueryContextService.java`                 |
| S8   | `src/main/java/org/openelisglobal/resultvalidation/service/ReviewSubmissionService.java`                   |
| S9   | `src/main/java/org/openelisglobal/resultvalidation/service/ReviewWriteGuard.java`                          |
| S10  | `src/main/java/org/openelisglobal/report/service/impl/ReportDocumentServiceImpl.java`                      |
| S11  | `src/main/java/org/openelisglobal/report/service/impl/PatientReportReleaseServiceImpl.java`                |
| S12  | `src/main/java/org/openelisglobal/reports/service/ReportAnalysisAuthorizationService.java`                 |
| S13  | `src/main/java/org/openelisglobal/report/service/impl/ReportFrozenContentService.java`                     |
| S14  | `src/main/java/org/openelisglobal/result/service/ResultIntakeAdmission.java`                               |
| S15  | `src/main/java/org/openelisglobal/result/service/ResultSpecimenWriteGuard.java`                            |
| S16  | `src/main/java/org/openelisglobal/result/service/OrdinaryResultReviewPolicy.java`                          |
| S17  | `src/main/java/org/openelisglobal/sample/service/EntrySubmissionService.java`                              |
| S18  | `src/main/java/org/openelisglobal/sample/service/SpecimenRecollectionService.java`                         |
| S19  | `src/main/java/org/openelisglobal/result/service/ResultEntryWorklistServiceImpl.java`                      |
| U1   | `src/main/java/org/openelisglobal/common/util/ControllerUtills.java`                                       |
| C1   | `src/main/java/org/openelisglobal/result/controller/rest/ResultEntryRestController.java`                   |
| C2   | `src/main/java/org/openelisglobal/report/controller/ReportDocumentRestController.java`                     |
| C3   | `src/main/java/org/openelisglobal/resultvalidation/controller/rest/AccessionValidationRestController.java` |
| H1   | `src/main/java/org/openelisglobal/common/rest/provider/PatientDashBoardProvider.java`                      |
| H2   | `src/main/java/org/openelisglobal/analysis/daoimpl/AnalysisDAOImpl.java`                                   |
| H3   | `frontend/src/components/home/Dashboard.tsx`                                                               |
| F1   | `frontend/src/components/order/OrderContext.jsx`                                                           |
| F2   | `frontend/src/components/resultPage/unified/UnifiedResults.tsx`                                            |
| F3   | `frontend/src/components/resultPage/unified/routeGates.tsx`                                                |
| T1   | `src/test/java/org/openelisglobal/sample/service/OrderEntryActorGuardTest.java`                            |
| T2   | `src/test/java/org/openelisglobal/sample/service/SpecimenReceiptServiceTest.java`                          |
| T3   | `src/test/java/org/openelisglobal/sample/service/SpecimenIntakeDecisionServiceTest.java`                   |
| T4   | `src/test/java/org/openelisglobal/sample/service/SpecimenRecollectionServiceTest.java`                     |
| T5   | `src/test/java/org/openelisglobal/result/service/ResultIntakeAdmissionTest.java`                           |
| T6   | `src/test/java/org/openelisglobal/result/service/ResultEntryWorklistServiceTest.java`                      |
| T7   | `src/test/java/org/openelisglobal/resultvalidation/service/ReviewSubmissionServiceTest.java`               |
| T8   | `src/test/java/org/openelisglobal/resultvalidation/service/ReviewWriteGuardTest.java`                      |
| T9   | `src/test/java/org/openelisglobal/report/service/impl/ReportDocumentServiceImplTest.java`                  |
| T10  | `src/test/java/org/openelisglobal/report/service/impl/PatientReportReleaseServiceImplTest.java`            |
| T11  | `src/test/java/org/openelisglobal/report/service/impl/ReportFrozenReleaseServiceTest.java`                 |
| T12  | `src/test/java/org/openelisglobal/report/service/impl/ReportFrozenContentServiceTest.java`                 |

本轮引用证据校验：54/54 与固定提交的文件 blob 一致。F2 按 `a52cafa4f5c87b2016fd9a325d857ae3bb517d94:frontend/src/components/resultPage/unified/UnifiedResults.tsx` 的 Git 对象读取；其余 53 份为核查时与该提交一致的文件。这只证明引用来源，不表示功能测试通过。
