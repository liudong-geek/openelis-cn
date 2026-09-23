# A-02 审核待办子批独立审查

2026-09-23；只读审查，无源码修改、无测试/构建/临床请求/浏览器操作。范围为 `/private/tmp/lis-active-20260923/a02-review-worktree`，基线 `3e1e3b402fc5`，包括审核 backend、现代审核页、首页摘要 hook。先读了本树 `specs/017-lis-product-delivery/a02-review-pending-contract.md`，以及前端/首页 handoff、后端 `docs/testing/review-pending-summary.md`。

本树是隔离候选，未据主树 A-03 内容缺失报告错误。审查时后端仍在格式化/准备执行，下面行号为读取时位置；方法名是持续定位依据。

## 结论

前端冻结候选在本次静态范围内没有发现新的阻塞性缺陷；后端发现两处与已冻结合同冲突的边界，已分别发给后端负责人并抄主线程。修正并补实际测试后可继续整合门禁；目前不能以此文签署“全部可提交/部署”。

| 发现 | 具体位置/可复现输入 | 影响 | 最小修正与验收 | 状态 |
| --- | --- | --- | --- | --- |
| P1：RETROCI 无法确认登记状态却进入完整审核队列 | `ResultsValidationUtility.sampleReadyForValidation` 原约368行用 `getSampleRecordStatus(sample) != NotRegistered`；`getSampleRecordStatus` 原约731–740行在 ObservationHistory 空时返回 null，未知状态也可能返回 null。新 `projectReviewAnalyses(..., true)` 直接复用；给一条授权 TechnicalAcceptance Analysis，设 RETROCI，缺登记历史/未知状态即可进入，而非明确不可查询 | 将未知登记依据当作允许；冻结合同规定无法可靠判断配置/历史数据应失败，不自行新增院方登记规则 | 仅新受控 projection 引入严格登记读取：缺类型、空/未知/矛盾历史明确失败；保留旧 public group/count 的历史兼容，或明确现代 RETROCI 暂不支持。补真实 helper/projection 的空历史、未知值、合法 NotRegistered/已登记及请求内缓存用例。不能把旧测试的“缺历史可见”当院方依据 | 后端已确认反例并向主线程申请限定修复；此文写入时尚未独立复核修正版 |
| P2：非法审核角色 ID 可被解释为真实零权限 | `UserServiceImpl.getAnalysisSectionIdsForLabUnitRole` 原约508–517行只判角色 ID 非空；若 roleId 为 `0`/`-1`/非数字而 getUserTestSections 返回空，轻摘要可成为 ready/0 | 配置异常被当“没有待审核”，违反冻结的角色/所选状态 ID 非正值应报配置错误合同 | 新 helper 验证合法正角色 ID；对显式损坏许可项也不要静默 filter 成空。测试保证非法配置不调用下游读取/不返回0，同时保留合法空授权集返回0 | 已发后端并抄主线程，待修正/回归证据 |

## 已核通过的关键合同（静态，不代替执行）

### 候选、计数与旧入口

- `AnalysisDAOImpl.REVIEW_PENDING_FROM` 同时被实体查询与 scalar 分组计数使用：`a.statusId in statusIds AND a.testSection.id in sectionIds`。没有以 Test 当前组替代 Analysis 实际组，也没有加 released/printed 排除条件。
- `ReviewScopeService.capture` 默认 TechnicalAcceptance，仅配置文本精确 `true` 加 TechnicalRejected；BiologistRejected 不加入；所选状态缺失/非正/撞 ID 会失败。没有新 ADMIN 跨组放行分支。
- 普通模式 `ReviewPendingService.summary` 仅 `visitReviewPendingAccessionCounts`，不调用 projection/患者/result/context，不为补 QC 数而读全量结果；非空 display/QC null/partial，真实空 ready/四0；RETROCI 非空轻摘要四数均未知。
- 审核 projection 与结果录入 projection 不同：无结果补1行；qualified child 只与已存在父行合并；多选合并仍保留分析行。本次没有发现可确定的普通模式“有 Analysis 却投影成0行”集合漂移，不照搬 A02录入的 child-only 排除谓词。
- `ReviewSummaryFactory.fromRows` 在同批授权投影/QC 注释后去重 Analysis，受理组按合法 `(sampleId, accession)`，行重复/身份冲突降为 partial；不从 Analysis 推算展示行或把总数减QC叫可放行。
- accession range 的 `>=` + 等长度与原 DAO 一致；日期按 Analysis.startedDate；精确受理号仍先找 sample，再同状态/同组查询。未发现悄悄改成其它范围。
- `PatientDashBoardProvider` 审核 JSON 分支要求 ROLE_VALIDATION、只取 request actor、使用新 service 与原 resultsPageSize/OrderDisplayBean，不读共享旧缓存、不采用客户端 userId。metrics 审核值也不再全局 count。其他 dashboard 指标不在通过范围。

### 查询 scope、context 与写保护

- 新现代 GET/summary/POST 明确 ROLE_VALIDATION；pending 与有效筛选混合、pending+doRange=false、未知 scope 均拒绝。
- 缺省 filtered 且无有效筛选、无 page/queryId 为 `unqueried`，无 token/无行/四计数null；带 page/queryId 先走 context 检查，不能借空筛选绕开。
- `ReviewPendingService` 只读 REPEATABLE_READ 中捕获 policy、候选→projection→context/summary，末尾再次核对 policy；没有 controller 另数一遍冒充同快照。
- `ReviewQueryContextService.Criteria` 保存 scope；context 保留 actor、原条件、policy、去标识和整次 summary。每页复用 summary/generatedAt；保留完整受理号同页，不用页行数当总计。
- context page/consume 继续验证 actor、queryId、原条件、当前实际组权限、Analysis状态/版本、去标识配置和本批 policy。服务器只复制允许的决定/备注，客户端不能覆盖 readOnly/证据/policy。
- `consumeSubmission` 返回服务端保存的 policy；现代 POST 传给 `ReviewSubmissionService.save(..., expectedPolicy)`。签名前、签名后、更新后、beforeCommit 再核对该策略；仍保留原 `ReviewWriteGuard`、QC、签名及事务/后提交外部影响，未增加自动写重试。
- released/printed 保留在队列和计数；context 对这些行强制 readOnly + reason，已有 readOnly 不解除；服务端已有 readOnly、发布打印及结果证据检查未删。
- 该方案在现有检查点识别 policy 变化，不等于内存配置已被数据库事务锁住；本次不声称跨事务撤权绝对即时或完整医院写入链验收。

### 前端与首页读取

- `/validation?scope=pending` 自动一次查询；无筛选 `/validation` 保持未查询；切换模式先执行 beforeQuery，保留草稿阻止切换、abort 与 generation。分页带原 scope/token；回包另一 scope 不使行变成可提交。
- `reviewQuerySummary` 固定字段读取、合法非负安全整数/UTC时间、ready/partial/unqueried关系、QC<=analysis、accession<=analysis、rows>=analysis；缺失或矛盾统计不从当前页补0。数据表的已有有效审核合同没有被计数装饰替代。
- 统计明确整次查询快照；当前加载批次 QC 和本地展示行分页另标。readOnly原因只解释服务器标记，不放宽写按钮。
- 首页去掉旧 `ordersReadyForValidation` 作为审核卡片的来源，使用新轻摘要的 analysisCount，链接 pending；partial 已知计数可显示，未知显示横线，合法空显示0。正式语言 delta 尚需主线程合入。
- 新 `useVerifiedPendingSummary` 是已修复结果读态生命周期的泛化：保持 `/session` 前后核验稳定 userId+sessionId+权限范围，storage立即 generation 失效/abort、普通render不重试、超时/晚响应不发布、不写共享CSRF。Results默认角色保持，审核明确Validation。
- 首页摘要只读方案没有放宽审核保存或全局写守卫。既有 `Index`/`ReviewSubmissionButton` 等仍存在 A-01已登记的CSRF掩码/生命周期边界；该已知问题不能在本子批中通过删保护掩盖，也不能宣称全局登录/写态已修好。

## 测试证据核对及剩余验收

本次没有重跑测试。已直接读取而非仅引用代理口述：

- `a02-review-frontend-tests-final.log`：9文件、128通过，64.87秒；scoped Prettier日志通过。
- `a02-review-home-tests-first.log`：6文件、177通过，23.37秒。
- 独立重算 `a02-review-frontend-frozen-files.json` 14文件和 `a02-review-home-candidate-files.json` 14文件，均与 manifest SHA256 相符。
- 已读新增/既有断言：Analysis实际组与Test当前组不同、已发/已打印保留、scalar/DAO集合、scope/config/actor/context失效、只读不能清、全查询summary页间不变、QC保存拦截、策略变化事务回滚、pending切模式草稿、错误非零、首页会话前后/多标签/晚响应。
- 当时后端 `docs/testing/review-pending-summary.md` 仍写 Maven/数据库未执行；runner的6个fake-subprocess生命周期用例不能代替后端执行。没有据测试文件存在认定后端已通过。

交付前的最小剩余：

1. 上述两项修正及原合同/文档相应更新，再独立看限定差异和针对用例。
2. 后端真实编译、目标测试、专属合成 PostgreSQL DAO/聚合与策略回滚证据；明确 DB IT 的真实范围，不冒充全部业务加载/医院E2E。
3. 合入主树时保留 A03/已验证会话修复，合并两份语言 delta，运行整合类型/全前端/构建门禁。
4. 实页比较首页审核项目数→pending列表整次analysis数；filtered/未查询/真实空/失败；分页保留快照；已发/打印只读；同角色多标签；合成范围变更/权限不足。root负责浏览器与部署，不用本静态报告代替。
5. RETROCI轻聚合、海量队列全投影内存容量、旧MVC其它入口和医院制度仍按合同留后续，不因本批通过关闭整个A-02。

有限审查在以上问题停止，不扩展成全局App/登录/审核模块重写。后端修正的补签请继续追加本文件，保留这次初审事实。

## 后端限定修正复核（2026-09-23，第一轮）

- P2 静态闭环：`getAnalysisSectionIdsForLabUnitRole` 已对 roleId、返回 sectionId 实施正整数字符校验；null/损坏许可记录明确异常，合法空许可仍空集。`ReviewScopeService.capture` 将该读取的 LIMSRuntimeException 转为503。新增 `invalidRoleAndSectionIdentitiesCannotBecomeConfirmedNoPermission` 包含0/负值/非数字/空值，并验证非法角色不调用下游权限读取。执行结果待后端实际测试。
- P1 严格读取函数与回归已新增，但本次读取发现尚未接通：`projectReviewAnalyses` 仍调用公开 `getGroupedTestsForAnalysisList`，后者固定 `strictRegistration=false`。因此还不能签收此修复。已向后端及主线程反馈精确调用链；建议仅新projection直接 `groupForReview(analyses, !useRecordStatus, true)`，旧公开入口保持false。新增 modern RETROCI 首个503断言应能抓住此问题。
- 以上是读取真实差异的更新，不依据代理声称“已修”自动关闭问题。后端正处编译/数据库测试窗口，本审查没有启动任何执行。

## 严格路径接通复核（2026-09-23，第二轮）

已重新读取 `ResultsValidationUtility`：第894–898行新 `projectReviewAnalyses` 直接调用 `groupForReview(analyses, !useRecordStatus, true)`；第280–282行旧公开group仍传false；第377–395行严格分支缺/非法类型ID及null登记状态抛503，旧null兼容只留旧路径。因此 P1 的调用链遗漏现已静态闭环。P2 上轮静态修正仍在。

主线程已通知后端第三轮121/121绿、WAR仍准备；本审查尚待具体冻结manifest/执行日志核对，不把通知当独立执行签署。两项源码阻塞已解除，执行/整合/实页边界仍按上文保留。

## 最终后端冻结证据补签（2026-09-23）

已独立读取最终 `a02-review-backend-evidence.json`、`/var/folders/y_/flq3k1617h33mq3s1d5_nq080000gn/T/lis-a02-review-backend-bjx9hi87/maven.log` 与同目录 `database-lifecycle.json`。日志记录15类121项通过，失败/错误/跳过均0，包含实际DAO2项与Spring/PostgreSQL探针写入回滚1项；WAR构建为BUILD SUCCESS，自有合成数据库created/dropped均true，package退出0。

独立重算38个清单文件加合同共39个文件，SHA256全部匹配。独立读取最终WAR：232623499字节，SHA256 `66def8a85693b31addfd6dcd863b38d11e5774c31070c4bd3dcb1ce9706204b7`，与清单一致。严格modern登记路径与非法角色/sectionID拒绝的新增用例已包括在这次通过的实际测试类中。两项初审发现及中途漏接严格路径现已源码与定向执行闭环。

该限定后端候选没有仍未关闭的本次审查阻塞，可交主线程按冻结产物合入/部署核验。明确不是全套后端测试、完整临床持久化回滚验收（IT采用合成探针写）、完整生产schema/外键或医院E2E，也不证明全队列内存/性能容量。之前记录的前端整合门禁、实际页面及A01全局写态边界仍保留。
