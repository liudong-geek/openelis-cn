# A02 结果页只读会话核验独立审查

2026-09-23，主树 `/private/tmp/lis-active-20260923/delivery-worktree`。限定只读审查，没有修改产品源码、运行测试/构建或发临床请求。产品范围为 `UnifiedResults.tsx`、`resultEntryTransport.ts`、新 `resultReadSession.ts` 及定向测试；另检查 root 的 A03 紧凑说明区改动。

## 当前结论

前后稳定身份核验的核心方案可继续验收。发现一个同账号撤权可见性遗漏，已由前端修正并补用例，等待真实执行；同账号合法scope变化是否清草稿正在等待root明确本批边界。尚未据测试文件存在宣称通过。

## 已核实的读取与写入边界

- 读key复用已经验证过的 `pendingSummarySessionKey`，含userId/sessionId、角色、登录实验室及实验室角色映射；必须具Results角色，不含CSRF掩码。
- `resultReadSessionKey` 拒绝会话读取错误及非authenticated phase；异常返回不可确认。
- 列表与两个下拉GET传入独立guard。transport先读真实`/session`，再读业务GET，末尾再读`/session`；稳定key不同/未知/401/403均不发布临床正文。业务失败也后验身份再返回错误。
- 沿用限定同源路径、GET、cookie包含、no-store、manual redirect和有界JSON读取；没有生成假登录/成功数据，没有将新掩码写回localStorage或全局App。总期限30秒，guard AbortSignal传播到实际fetch。
- 前端每次读绑定generation、expectedkey、mounted和独立worklistReadEpoch。新查询取消旧查询，storage CSRF变动或clear取消全部旧GET；忽略abort的迟到返回也需通过guard才能应用。
- storage触发后立即隐藏rows、患者/标本、草稿正文与下拉，清选择、释放签名API，保留draft map并标held；只有手动查询且同稳定key前后通过才重新展示。不会自动重试写。
- 保存函数、显式submittedSession.csrf、signature API和`resultEntryState.sessionReady`未改。`ready()`新增readscope可确认与未暂停约束只是收紧，仍保留原stamp/CSRF/localStorage、revokedSession、旧写gate。未知结果与恢复草稿仍不能绕过原检查。
- UI读取成功不等于写态修复：掩码不一致时可以看列表/选标本，编辑/签名/保存仍受原gate阻止，并给出明确暂停说明。保存后的readback仍是旧写链的严格生命周期，本批没有假装解决所有A01入口。
- 旧集成测试的限定fixture差异是补真实Results角色和/session响应，没有删除原保存/回查/导航断言。

## 审查发现及处理

| 发现 | 复现及原因 | 当前状态 |
| --- | --- | --- |
| P1 同账号撤去Results角色后旧私有行未立即隐藏 | 同userId/sessionId/csrf且localStorage匹配，context.roles从Results变为Validation。readKey变null，但原scopeChanged要求两个key非空，旧sessionReady不看角色，effect跳过hold | 已实际读到修正版：无readKey无条件hold；ready额外要求readReady避免effect前旧回调窗口。新增撤角色/损坏scope rerender用例断言隐藏正文、取消GET、迟到不发布、不写。执行待确认 |
| 同账号合法scope变动清除草稿 | 新scopeChanged（两key有效但不同）与真实身份变化共用clearPrivateState，清drafts/pendingSaves；不像storage/无效scope采用hold | 已报root判断“held不丢”的本批要求是否覆盖。若覆盖，最小是同identity scopeChanged走hold，保留真实换号旧clear边界；不新增全局账户草稿持久化 |

## A03 紧凑区增量

`ResultSpecimenBlockSummary.tsx`将已选单原因的受影响数从每项identity区移到标题，仍受countsAvailable控制；多原因与全部模式计数保留。每项`id=summary.id`、role=note、tabIndex=-1、hidden详情DOM和外层aria-labelledby未移除，行关联/focus仍指向原原因。CSS限定results-workbench，缩间距/字体与单区padding，无截断告警、无display隐藏原因规则；`identity:empty`只隐藏现已空容器。实际首屏与窄屏视觉效果仍由root重建浏览器核验。

## 待完成证据

1. 前端定向实际日志和冻结hash；关闭上面的scope草稿边界。
2. 主线程合入语言delta，整合类型/全前端/构建门禁。
3. 实页同账号不同掩码：Dashboard进入Results→列表加载→选标本→写仍暂停；storage/退出/换号旧内容不出现；本批不跑临床写入。
4. A01服务端expected actor/session写合同、跨身份草稿持久化、完整后端/E2E不在此修复结论中。

## 本轮继续核对（2026-09-23，冻结前）

Root已明确：同actor/session合法scope变动采用hold，保留草稿及未知提交；真实actor/session变化沿用原clear，不新增跨账号持久化。实施必须同时保证新scope查询通过后不会直接展示旧scope草稿正文或自动恢复其写入状态。已向前端指出当前`ResultDraftReview`全量draft map直接展示的二次暴露边界，待限定scope绑定/当前权限回查后再核验。

实际读取首轮整合定向日志 `results-read-and-review-integrated-tests-first.log`：36文件，31通过/5失败；655项中650通过/5失败。失败不能忽略，尚未通过。新增guard参数、scope重新查询、只读输入不渲染等测试需按新真实合同校准，但其中“旧查询迟到403仍撤销同凭证”是原安全合同，不能删改断言来变绿。

Root已再次明确：真实收到HTTP401/403且仍同当前stamp时，保持原revokeFor优先于结果freshness检查；跨身份旧错误不能撤销新会话。旧成功数据仍被epoch/abort隔离。需同时检查transport能传回明确安全错误，而非只在mock callback修顺序。

## 源码修正限定复核（2026-09-23，执行前）

已实际重新读取最新三份产品文件：

- 同identity的scopeChanged现走hold，只有真实stamp身份变化/缺失保留原clear。原draft map及pending disposition保留。
- 新`draftReadScopes`在首次记录草稿时绑定当时稳定readscope；再次编辑/保存不会重绑。签名未知结果捕获的是签名意图创建时的scope。只有当前已核验scope匹配的草稿可显示正文，恢复/丢弃也再核scope；其它scope只给不含患者/结果的提示。返回原scope后仍是held，不自动写入；未知/pending仍由原analysisUnconfirmed阻止重发。
- readKey不可确认无条件hold，ready同时额外要求readReady。旧写函数、CSRF相等检查与签名guard保持，并且新增检查只是收紧。
- 元数据与列表callback均恢复revokeFor在freshness之前。transport把真实HTTP401/403的明确错误在abort/current后续检查前保留到callback；旧成功数据仍须完整前后身份与generation通过。当前stamp比对维持跨身份错误隔离。

本次静态审查发现的源码问题现已闭环，暂未发现新的限定阻塞；仍等待最终目标测试、冻结hash后签收。这里只是读代码，不是测试已执行的证据。

## 最终候选签收（2026-09-23）

已读取 `results-read-guard-handoff.md` 与最终 `results-read-guard-frozen-files.json`，独立重算14个文件SHA256，全部匹配。另直接将当前 `saveResultWorkbench` 从函数声明至文件尾与Git HEAD比较，逐字相同；并非只依据代理说明确认未放宽POST。`holdPrivateReadState`最终版本还清除实验室编号/组/日期/状态筛选和原URL身份参数，保留私有draft map。

已实际读取本轮执行日志：

- `results-read-guard-tests-second.log`：22文件365例，363通过/2失败。失败为block context已展开状态重复查找展开按钮，以及英文handoff测试使用中文按钮名。原同stamp晚403安全断言保留，新增scope editing/unknown及真实late HTTP401/403场景在此轮通过。
- `results-read-guard-tests-corrected.log`：修正上述测试定位及测试变量类型后，3文件38/38通过。交接记录声明此阶段未改产品源码；本次重算文件与冻结清单一致。两份日志合并覆盖Results22个唯一文件365例的最新通过状态，不伪称单轮22文件全绿。
- `results-read-review-transport-supplement.log`：遗漏的审核transport1文件11/11通过。与前轮首页177/审核其余117及Results365合计指定37个唯一文件670例；这不是整个前端全量。
- `results-read-guard-prettier.log`：限定格式检查通过。

最终静态结论：本次独立审查提出的撤权隐藏、同账号scope变更草稿丢失/跨scope再暴露，以及同凭证迟到安全拒绝被吞均已闭环；目前没有本批限定的剩余阻塞，可以交主线程继续整合门禁和浏览器验收。草稿与未知提交在原身份/原scope内保全，真正换actor/session仍沿用既有clear；读核验未放宽旧CSRF、签名或POST写保护。

A03紧凑说明区原因ID/hidden DOM/焦点未丢；实际布局签收仍需root最终构建实页证据。全量类型基线/前端套件/构建/真实浏览器、完整后端写E2E与A01服务端expected actor/session不是以上定向日志可替代的，不能据此宣布所有会话/临床功能已经完成。
