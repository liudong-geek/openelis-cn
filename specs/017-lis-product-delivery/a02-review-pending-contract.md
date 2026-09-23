# A-02 待审核子批：最小实施合同 v1（主负责人已确认实施）

源基线：`3e1e3b402fc549236c28446cc53cd652c913385b`。本文件承接 `a02-review-pending-contract-audit.md`；2026-09-23 主负责人已依据现有计划/用户授权确认下述最小范围实施。冻结时尚未改源码或执行本批测试。合成样例见同目录 `a02-review-pending-fixtures.json` 与 `a02-review-pending-test-matrix.md`。

## 1. 本批唯一目标

现代 `/validation`、首页待审核卡片以及该卡片的旧 JSON 钻取分支使用同一个“当前审核人员可见的待审核分析集合”。主计数单位为 **检验项目（distinct Analysis）**。保留现有审核保存、签名、QC 受阻与只读保护，不做旧 MVC 审核模块的大改造。

这里的“可见待审核集合”不承诺每一项都能审核通过。既有查询会展示的技术状态但已发布/已打印记录继续显示、继续计数，服务器标为只读并注明原因；保存保护照常拒绝。禁止只从 count 中排除这类记录。

## 2. 明确的范围、路由和参数

### 2.1 前端路由

| 场景 | 路由 | 动作 |
|---|---|---|
| 首页“待审核检验项目”进入 | `/validation?scope=pending` | 自动发起当前人员全部可见待审核查询 |
| 原按检验组搜索 | `/validation?type=routine&testSectionId=101` | 保留现有检验组筛选；无 testSectionId 仅显示搜索表单 |
| 原精确受理号 | `/validation?type=order&accessionNumber=SIM-A02-R-A` | 保留原精确查询，不改成范围 |
| 原受理号范围/日期 | 现有 type=range/type=testDate 路由 | 保留参数与行为 |
| `/validation` 或 `/validation?type=routine` 且无筛选 | 原默认搜索页面 | 状态为“请先选择查询范围”，绝不能显示“全部待审为 0” |

增加“全部待审核”模式即可，复用当前 SearchForm、列表和 queryId，不新造一个审核页面。切换回检验组/受理号搜索时移除 scope=pending，走既有未保存内容确认、请求取消和 generation 保护。

### 2.2 HTTP 合同

1. `GET /rest/review/pending/summary`：仅当前 actor 的**全部可见待审核**轻摘要。无筛选、userId、页码参数。明确审核权限；正常表单登录的 Validation 已规范化为 ROLE_VALIDATION。仍必须复用服务内真实组授权，不增加 ADMIN 自动跨组通路。
2. `GET /rest/AccessionValidation?scope=pending`：显式新全待审查询，返回现有 `ResultValidationForm`，附加 `reviewScope="pending"` 与 `summary`；保留 queryId/resultList/paging/doRange 等原字段。
3. `GET /rest/AccessionValidation?scope=pending&queryId=<token>&page=2`：同一查询的下一页。scope 必须与 token 相同；原有范围和 actor 绑定仍生效。
4. 原带 accessionNumber/date/unitType 的 GET：缺省 scope 解析为 `filtered`，仍保留参数优先顺序（受理号 > 日期 > 检验组）及 doRange。响应 `reviewScope="filtered"`，summary 是**整次筛选查询**，不是当前页。
5. 原无有效筛选、无 page/queryId 的 GET：200，`searchFinished=false`、`queryId=null`、`resultList=[]`、`summary.state="unqueried"`。不生成可提交空 token，不弹“无审核结果”。带 page/queryId 的请求不能用这一分支绕过现有失效检查。
6. `scope=pending` 与非空筛选参数同时提交，或 pending 下显式 doRange=false：400，避免悄悄忽略条件。未知 scope：400。scope 默认 filtered，pending 的 canonical doRange=true。
7. POST 仍为 `/rest/AccessionValidation`。新 `reviewScope` 随服务器表单由现有 prepareSubmission 整体复制；旧表单缺省 filtered。服务器只用它校验已存 context，不信任客户端更改范围。保存/签名流程不另建。

完整查询添加 summary 必须在同一次服务事务与已授权行上生成；不能控制器先完成查询再另发 count 冒充同一快照。

### 2.3 分页

- 继续使用 `PagingProperties.validationPageSize`；不接受客户端 pageSize 覆盖。
- 继续保持完整受理号在同页，单个受理号允许超过配置页大小。
- 页码从 1 开始；原 queryId 的无效页/过期/条件变更继续 409，权限撤销403。无 token 不退回共享缓存。
- `summary` 表示整个 context；各页保留同一 summary/generatedAt。不能把当前页的 resultList.length、页数×pageSize 当总数。
- 上一子批修过的 `home-dashboard/ORDERS_READY_FOR_VALIDATION` 尚未授权收敛；本批该**单一分支**必须改为当前 actor、同候选范围，忽略 userId 请求参数、按原 resultsPageSize 和 OrderDisplayBean 响应形状服务。它不是旧 MVC 大重构，仍属于首页所需的数据入口；其它 tile 不在本批宣称修好。

## 3. 最小摘要 DTO：固定 7 字段

候选名 `ReviewPendingSummary`，与结果录入摘要分开，不改既有 DTO。

| 字段 | 值及约束 |
|---|---|
| scope | `pending` / `filtered`；首页仅 pending |
| state | `unqueried` / `partial` / `ready` |
| analysisCount | nullable nonnegative Long；不同有效 Analysis 数，首页优先单位 |
| accessionCount | nullable nonnegative Long；合法 `(sampleId, accessionNumber)` 去重的受理号组数，不称临床申请单数 |
| displayRowCount | nullable nonnegative Long；实际授权投影后的行数，不从 analysisCount 推算 |
| qcBlockedAnalysisCount | nullable nonnegative Long；可见候选中 QC 受阻的不同 Analysis 数，不累计 violation 或组件数 |
| generatedAt | 服务端内部产生的 UTC ISO 时间；context 页复用其创建时刻 |

本批不加标本管数，避免申请/受理号/管数混淆。若以后增加 specimenCount，应另冻结合法身份合同。

`ready` 要求上述四个计数均确认且非负；`qcBlockedAnalysisCount <= analysisCount`。`unqueried` 四个计数全 null，限无筛选未查询表单。`partial` 至少一个计数未知；不得把缺字段、接口错误、配置失效当 0。

本批轻摘要普通模式可以给出 analysisCount/accessionCount；**非空 displayRowCount=null，qcBlockedAnalysisCount=null**，state=partial。不为补这两个数在首页加载全量结果或遍历 QC blockers。确认候选为空时四计数都是 0、ready。完整查询从已授权全部 rows 和已标注的 QC blockers 计算四计数；身份不可信或投影冲突不声称 ready。

QC 的数是“因当前质控受阻而不能接受的可见项目子集”，受阻项目仍包含在总数内。普通 WARNING、已解决 violation 不算；仪器/test 匹配及 UNRESOLVED/ACKNOWLEDGED + REJECTION 沿用 QCReleaseGateService。`analysisCount-qcBlockedAnalysisCount` 不命名为“可放行数量”。原每页 QC 提示照常保留；全查询 QC 数需明确标签，不能与当前页提示混称。

## 4. 单一候选和请求内配置一致性

最小服务合同建议：

`ReviewScopeSnapshot(actor, authorizedAnalysisSectionIds, validationStatusIds, validateRejected, recordStatusMode, depersonalized)`；actor 从会话取，许可组从现有 `getUserTestSections(... ROLE_VALIDATION)` 取得并复用 `filterAnalysesByLabUnitRoles` 的实际分析组语义。

- 白名单：TechnicalAcceptance；`VALIDATE_REJECTED_TESTS == "true"` 才加 TechnicalRejected。BiologistRejected 不加入。
- 使用 `Analysis.testSection.id`，绝不改成 Test 当前所属组。无权限集合是真实空；角色/选用状态 ID 缺失、非正值或撞 ID 是配置错误，返回明确错误/未知状态，不给 0。状态异常 HTTP 建议503；是否统一到现有配置错误映射由主代理最终确认，前端统一显示“暂无法获取”。
- **不增加 released/printed 排除谓词**。投影时 `row.readOnly = row.readOnly || released || printed`，保留原 readOnly 原因。可附只读原因代码 `reviewReadOnlyReason = released / printed / released_and_printed` 供行内解释；客户端不能反向解除。
- 服务开始捕获不可变快照，候选、投影以及摘要均使用该快照；结束前重读相关配置/许可核对。中途变化409，整次结果作废。不能让 controller、utility 和 count 各自临时读开关拼成不同集合。
- Context 增加 scope 和影响候选的配置指纹；翻页/提交时配置变化409重新查询。保持已有 actor/条件/去标识/analysis状态版本检查。
- 数据库层 list+summary 需同一只读 REPEATABLE_READ 服务事务；配置对象可能不在数据库事务里，仍要捕获+结束比对。不要声称单凭事务能冻结内存配置。
- QC blocker 是查询快照注释，并非永远有效的放行许可；保存阶段现有 SERIALIZABLE + 再检查保留。页 summary/generatedAt 不虚构“现在实时 QC 状态”。

登记模式处理采取保守最小方案：普通非 RETROCI 路径可聚合精确 analysis/accession；RETROCI 在未建立与既有登记投影严格等价的轻查询前，非空候选的轻摘要四数均 null/partial（允许空授权集合直接确认0）。完整现代查询需复用一次请求内的登记判断，修复现文件 `accessionToValidMap` 未初始化/潜在跨请求缓存问题，不新造登记制度；无法可靠判断的配置/历史数据应失败而不是空队列。若该修复超出本批可证范围，RETROCI 现代查询不标支持完成，保留为明确未完成项。

## 5. 全待审 scope 为什么是最小改法及容量边界

全 scope 只新增一个明确的查询意图，授权候选先取得，再用现有 utility 投影，最后调用现有 context.create，保留已有分页/签名/患者去标识/权限复查。这样不需要第二套审核保存数据模型。

首页轻摘要**禁止**调用 utility、患者服务、resultService、context.create 或拉取全量 Analysis 实体；DAO 只取 scalar aggregate/projection，并在服务里形成 DTO。

全 scope 用户实际打开列表时，最小实现仍沿用现有“整次投影保存到最多8个、20分钟会话 context，再切页”的模型。它不代表海量队列已经做成数据库游标分页。此容量问题后续单独处理；本批不得静默截取前 N 条后仍把列表当全部。若实际演示数据规模使整次查询不可接受，必须回报该容量阻塞，不能私加业务筛选/上限掩盖计数漂移。

## 6. 本批闭环与后续边界

**可在本批闭环：**普通模式下首页审核分析数量与全部/筛选现代查询同授权状态；明确 pending 与 unqueried；同次完整查询 summary；已发/打印保留只读；配置变更失效；首页审核旧 JSON 分支权限；典型合成数据真实 DAO 集合/聚合与 UI 回归。

**保持明确后续：**非空轻摘要精确 displayRowCount/QC数；未经验证的 RETROCI 轻聚合；海量全待审的有界数据库分页；所有旧 MVC 的安全改造；其它首页指标；院方实际审核制度和生产性能验收。这批通过不能等同整个 A-02 完成，也不能将长期 partial 当作最终解决。

## 7. 最小候选文件组（尚不修改）

- 后端：新增 scope/摘要服务与 DTO；AnalysisDAO/Impl + service 的轻聚合/授权候选；UserService 的实际审核组 helper；ReviewQueryContextService；ResultValidationForm/AnalysisItem（scope、summary、只读原因）；AccessionValidationRestController；PatientDashBoardProvider 的审核分支；ResultsValidationUtility 的受控投影入口/请求内登记判断。
- 前端：Dashboard 与审核摘要 hook/parser；SearchForm 的 pending 模式、参数和 unqueried 响应；Index/Validation 的全查询计数/只读理由展示及保留上下文；必要字典和已有回归。
- 测试：使用附带独立 fixture matrix；真实 ORM/专属合成数据库执行实际候选/聚合；复用现有上下文、保存、QC、请求代次和权限测试。不要仅用另一套近似 SQL 自证。

确认点只有上述最小合同本身，主代理可按已有授权决定实现细节；不需要据此向用户重新征求普通开发许可。收到主代理确认前本子代理保持只读。

## 主负责人实施补充

- 本批默认保留已发/已打印的现有可见性，增加只读解释不解除任何写守卫；不自行启用院方新审核制度。
- 新REST及统一查询均显式ROLE_VALIDATION；旧首页审核JSON仅用服务端actor。配置错误沿用既有明确错误机制，前端未知不补零。
- 独立工作树 `a02-review-worktree`，前端与后端分别拥有文件，主树A02登录修复/A03同时验收，不能彼此整文件覆盖。
- 契约与测试矩阵是既有A-02子批实施细化，不关闭A-02或减少其旧入口/容量/其他待办后续范围。
