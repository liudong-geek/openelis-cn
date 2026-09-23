# B-01 / C-01 采集接收工作区：现有能力与最小改造候选

核查日期：2026-09-23。性质：有界只读代码与测试断言盘点；不是业务验收、实现方案批准或医院岗位制度。没有修改业务源码、操作浏览器、写临床数据、启动构建或测试。

## 1. 接续依据与结论

已读工作区 `docs/lis-delivery/README.md`、台账接手记录、变更记录。固定要求仍为：B-01 现有实页正常/重复或未知码/拒收补采/部分失败；C-01 十管连续处理、身份核对、防重、两管部分拒收、补采关联、独立事件。Q-01 机构岗位与 Q-03 签收/验收能否同岗仍待定，不因本报告变为既定制度。

审查位置：`/private/tmp/lis-active-20260923/delivery-worktree`；读取时 HEAD `3e1e3b402fc5`，分支 `feat/017-lis-product-delivery-m1-report-foundation`。主线程另有 A-02 摘要会话修复、A-03 说明及手册未提交改动；本次检查的 order/sample 目标文件未出现在当次 tracked status 中。没有以此前恢复副本代替主树。适用仓库 AGENTS 已在本任务前序完整读取，本次目标目录未发现追加 AGENTS。运行版正在由主线程验收，本报告不以源码 HEAD 推断当前浏览器版本。

**结论：核心写入能力已有，主要缺口是日常入口、可信查询衔接与连续任务交互。不能把现有恢复面板改个标题就宣称 C-01 完成，也不需要再造一套收管/拒收/补采服务。**

关键边界：

1. `/order/collect` 扫码查询的是实验室申请号，载入旧采集表单。实际独立签收、验收决定、补采组件却在 `/order/enter` 的“核对当前申请”恢复面板内，入口需要首次保存的 UUID 核验码。
2. `EntrySubmissionService.recoverCurrent()` 强制首次回执创建人与当前操作者一致。它用于“恢复本人提交”，不能删掉所有者保护，或让接收人员拿开单人员的回执 UUID 当日常权限凭证。
3. 日常跨岗位页面需要单独的、按**当前实际权限**查询标本事实的入口。可复用 `EntryCurrentStateReader` 的事实投影和现有写服务；不能伪造一份回执去调用它，也不能把旧 `/order/search` 应答直接当已验证写入快照。
4. 收管服务支持**同一申请**最多 100 管原子提交；验收服务是**每管一个决定**。两管一接收一拒收已有断言覆盖，十管跨申请连续扫码的工作区尚未见实现及验收证据。

## 2. 当前真实入口与用户会遇到的断点

下列路径均为当前仓库实际存在的路由；根前缀为 `frontend/src/components/`。

| 入口 | 真实实现与权限 | 目前行为 | B/C 影响 |
| --- | --- | --- | --- |
| `/order` | `App.jsx:676` Reception；`order/OrderDashboard.jsx:283,304,356` | 继续按准备阶段打开 collect/label/qa；扫码后打开 `/order/enter?labNumber=...` | 申请列表不是逐管接收台；扫码会进入申请表，不是选定实管 |
| `/order/collect` | `App.jsx:688` Reception；`order/steps/OrderCollect.jsx` | 顶部扫码；申请项目、知情信息、多个采集卡；先保存，再到标签页 | 有采集编辑基础，未提供十管操作队列和独立签收/验收面板 |
| `/order/enter` 内核验面板 | `steps/OrderEnter.jsx:615` → `EntryRecoveryPanel.jsx` | 默认折叠小按钮；输入 maxLength=36 的提交核验编号，查询本人当前回执；依次渲染摘要、验收、QA、签收、采集、标签 | 能力丰富但隐藏、顺序与实际任务状态不直观；不是通用扫描查询 |
| `/order/qa` | `steps/OrderQA.jsx:121–199` | 保存申请 + 独立 QA 清单，依据 allRequiredVerified 标记清单完成 | 不等于每管已验收；`orderIntakeStatus.ts` 已刻意称 checklist_complete，不能再改称全部接收成功 |
| 补采面板 | `RecoveredSpecimenDecision.jsx:466` → `RecoveredSpecimenRecollection.jsx` | 先按源管查已有关系；明确创建新 REQUESTED 管申请；已有标签打印入口 `/PrintBarcode?labNumber=...` | 创建后尚无新实管，不得显示已重采/已签收；需补明确“返回待采集”衔接 |

### 扫码缺口的直接证据

- `BarcodeScannerBar.jsx:51–105` 只 trim 后调用 `loadOrder(code, true)`；成功清输入；成功/失败提示 3 秒后消失；人为等待至少 500ms；无扫描流水、重复状态、焦点恢复、完整实管解析、错误分类或自己的请求代次。
- `OrderContext.jsx:653–768` 调用 `/rest/order/search?labNumber=`；后台 `OrderSearchRestController.java:206–215` 用 `getSampleByAccessionNumber` 精确按申请号查找。当前管展示码在 `specimenReceipt.js:86`、`RecoveredSpecimenDecision.jsx:132` 为 `labNo.sortOrder`。**不能据此声称扫描打印出的完整管码已经能查到相应管。** 也不能只按最后一个点截断：实验室编号合同允许点，需要服务端真实身份解析与歧义处理。
- `loadOrder` 成功会替换 orderData/samples，清 isDirty；该扫码链本身未检查草稿/征求换申请确认。原页离开提示不等于原地换申请保护。连续操作前必须补场景回归，不能只加自动跳下一管。
- unknown barcode、授权失败、查询失败目前都可落到同一“扫码错误”反馈；`loadOrder` 的旧 callback 未针对 requestError 提供独立语义。查不到新码时旧申请仍可能留在视图，界面必须明确区分“本次没查到”与“上一条仍显示”，不可让人把旧患者当新码结果。
- 本次检查了 sample/rest、sampleitem/controller、sampletyperequest/controller 的目标端点；现有 sample-management 搜索仍按 accessionNumber。未找到已经同时支持管码解析、当前 Reception/Test 授权、版本化 intake 快照的现成桥接。该结论限于此目标边界，不宣称全仓不存在任何条码查询。

## 3. 必须复用的服务、事务与事实

后端根前缀：`src/main/java/org/openelisglobal/`。

| 能力 | 现有调用/服务 | 真实合同与保留要求 |
| --- | --- | --- |
| 首次开单回执 | `sample/controller/rest/SamplePatientEntryRestController.java:483,496`；`sample/service/EntrySubmissionService.java:95–145,333` | UUID → 不可变开单回执 + 当前事实；只允许回执所有者并校验检验权限。继续保留为未知开单恢复专用入口 |
| 当前标本事实 | `sample/service/EntryCurrentStateReader.java:132–281` | REPEATABLE_READ、只读；身份/申请/逻辑管/实管/全部检验关系核实；接收者当前 Test 授权；状态、QA、逐管决定/准入、原因目录。现入口依赖已授权的不可变回执；不是现成的任意 ID 查询。存在分装等 unsupported 边界 |
| 采集 | `SamplePatientEntryRestController.java:272–296` → `sample/service/SamplePatientEntryServiceImpl.java:463–707` | collectionOnly 分支，明确逻辑 requestId；事务内生成/更新实管和 Analysis，并绑定原请求；重复请求不能重复生成；不派发普通整单副作用。`collectionRecovery.js:214–233` 白名单不写签收、患者、整单、标签 |
| 实管签收 | `SpecimenReceiptRestController.java:31` → `SpecimenReceiptService.java:63–195` | 同一 sample/patient/labNo 下明确 tubes；未默认全选。全批先验证、后写入，任一失败整批回滚；只改实管 receivedDate 并走 SAMPLE_ITEM 审计。相同已存时刻可零写重放，不可覆盖已有另一时刻；不顺带完成验收/QA/结果 |
| 单管验收决定 | `SpecimenIntakeDecisionRestController.java:37` → `SpecimenIntakeDecisionService.java:79–246` | SERIALIZABLE；单一 sampleItemId/requestId、operationId、expectedEvidenceDigest；ACCEPTED/REJECTED 必须显式选择；拒收原因来自有效、版本绑定目录；冻结决定、人、时刻、原因、证据。拒收另更新原实管拒收状态/审计；不影响另一管，不直接打开结果入口 |
| 当前结果准入 | `SpecimenIntakeDecisionReader` + `intakeAdmission.js`/`RecoveredSpecimenDecision.jsx:95–125` | 历史 ACCEPTED 不等于当前仍可录入；需要当前证据、具体检验权限、状态匹配。部分准入保留具体阻断，不整单冒充通过 |
| 关联补采 | `SpecimenRecollectionRestController.java:39,59,64` → `SpecimenRecollectionService.java:77–192` | 从真实 REJECTED 决定和源 request/item/evidence 创建**新的待采逻辑请求**，保存源决定/原管/新 request 关系；原拒收管不修改。operation 和 source 唯一约束防重；新请求与关联分别审计。按源关系查询不创建新申请 |
| 当前操作者 | `OrderEntryActorGuard.java:79–157` | 实际登录、启用账号、Reception/GlobalAdmin、会话与真实权限；上述写服务再查目标 Test 权限。不能把“菜单可见”或前端传来的 actor 当授权 |

独立事件不能混为一个状态条：开单回执、采集事实、实管签收、逐管验收决定、补采关联、QA 清单分别存在。现有 `sample.receivedTimestamp` 是申请/登记层事实，不能当某根实管的签收时间。

**遗留差异需保留并验证：** 旧 `SampleCollectionCard.jsx:58–81,348–437` 会填入采集/接收时间；旧 collectionOnly 服务允许传入 receivedDate。安全恢复采集白名单不带该字段。本批页面合并不得静默把旧自动值展示成“操作者已经签收”的独立事件。采集/签收的现有审计也不等于已经有完整用户可见事件时间线；如历史没有相应操作者，显示未提供，不用当前操作者补填。

## 4. 固定验收差异表

“已有”仅表示实现与相应断言存在；本轮没有运行这些测试。历史 A02/A03 通过记录不能替代本表 C-01 验收。

| 固定场景 | 已有 | 缺失 / 需复测 | 下一次最小验证 |
| --- | --- | --- | --- |
| 十管连续处理 | 可按明确定义选择若干管采集；同申请最多100管签收；单管验收后可选下一管 | 没有十管连续扫码队列、跨申请衔接、完成后焦点/键盘验收；现恢复查询仅本人 UUID | 10 根合成管，含多个申请、同类两管和患者切换；逐条核对 IDs 与 POST 次数；成功确认后才推进，页面不重进开单 |
| 身份核对 | 当前快照含患者、申请、requestId、sampleItemId、类型、真实检验；写服务核实关系 | 常规扫码只按申请号；管码/外部码/歧义合同未确认；读显示与写快照有两套来源 | 申请号只能选申请；完整管码只能定位真实唯一管；同类型不靠行号关联；无匹配/多匹配均零写；保留前一患者时明确标记 |
| 重复扫描/重复提交 | 采集绑定防重；签收原时刻重放；intake operation 防重；补采源管唯一 | 没有扫描层重复提示；UI 当前再扫是 reload；存在原地替换草稿风险 | 同码连续扫描两次、同键双击、旧响应后到：不新增采集/签收/验收/补采记录；重复显示“已有记录”，不是再成功一次 |
| 未知码 | 申请搜索无匹配404，扫码捕获失败 | 未区分未知码/服务器失败/未授权；3秒消失反馈不适合作业核对 | 未知码、500、超时、401/403分别显示；未知不自动创建；原待确认操作/草稿仍在；不把超时解释成已失败回滚 |
| 两管部分拒收 | 真正单管决定；现有 Provider 用例先接收第一管、再拒收第二管；后台检查拒收不影响另一管 | 缺当前实页+真实 DB 持久记录验收；列表异常整单提示不能替代逐管事实 | 同一申请同类两管 A 接收/B 拒收，核验A/B IDs、两个独立操作/审计、B原因快照；A按当前准入可继续，B保持拦截 |
| 部分失败 | 签收批次全部先验证；任一写/审计失败回滚；intake 每次仅一管 | 页面不能把同申请批签收展示成每管分别成功；十管队列跨请求部分完成没有聚合记录 | 签收 A+B 中 B 冲突→两者均不变；独立验收 A已提交、B失败→A仍在；显示已确认/待核实/未处理，不回滚或重发A |
| 补采关联 | 源拒收管→新 REQUESTED requestId，原管不变，关系可重复只读查询 | 无完整“创建→新采集→新实管→签收→验收”同候选链证据；现只提供标签打印入口 | 原拒收管、sourceDecision、newRequest、新实管对应；反复点/刷新/超时不创建第二替代请求；原拒收历史保留 |
| 独立事件 | 开单回执、采集字段、SAMPLE_ITEM签收审计、intake决定、补采关系、QA各自存在 | 缺统一简明展示与逐条持久验证；历史事件来源完整性不同 | 操作前后分别核事件/字段/人/时刻；仅收管不得自动ACCEPTED，仅QA不得自动准入，标签生成不得当已打印或已采集 |
| 权限/会话/草稿 | 服务级 actor/Test 保护、冻结快照、未知提交 checkpoint；恢复多数路径互斥 | A-01 同账号mask变化误停、跨账号expected身份未绑定仍是依赖；补采组件独立状态机比Context保护弱，未知仅内存状态，刷新后404可能再开放创建，需专项核查 | 同账号合法轮换；不同账号/撤权；确认后发出前变化；保存中扫描下一患者；超时/刷新/迟到返回；只能核实，不能无依据新键盲重发 |

## 5. 已有测试可直接接续，别重写业务算法

前端根：`frontend/src/components/order/`。这些测试大量使用真实 Provider/Carbon 但 mock transport，不是完整真实后端 E2E。

| 测试文件 | 已核到的关键断言 | 仍需补的 B/C 证据 |
| --- | --- | --- |
| `RecoveredCollectionFlow.test.jsx` / `collectionRecovery.test.js` | 只采选中剩余管；不改旧整单；明确回滚后保留填写且重新采用；未知不重发；迟到/跨会话不能成功 | 扫码绑定真实当前管、十管连续、旧collect入口合同 |
| `RecoveredReceiptFlow.test.jsx` / `specimenReceipt.test.js` | 选管/预览/取消零POST；确认一次再逐管读回；两管缺一签收事实不解除；未知刷新零重发；互斥及会话变更 | 十管跨申请、UI焦点/重复码、真实DB原子批次 |
| `RecoveredIntakeFlow.test.jsx:151–219` / `intakeDecision.test.js` | 只写当前管；先接收A后拒收B；不标QA完成、不写旧整单；取消零写；400/409/500未知；同账号token变化旧预览不可恢复 | 合法mask变化后的可用性由A-01新合同修，不可简单删除旧保护用例；补实页与DB两管结果 |
| `RecoveredSpecimenDecision.test.jsx` / `intakeAdmission.test.js` | 当前准入与历史分离、部分权限、无权/有草稿/未知操作不能进入结果 | 跨岗位日常查询入口、新快照迁移后不得借旧准入 |
| `RecoveredSpecimenRecollection.test.jsx` / `specimenRecollection.test.ts` | 先读已有关系、创建一次、标签跳转；create500+recover404不盲重试；原拒收条件 | 未知后组件卸载/刷新、账号切换、创建到新实管完整链、关系变化/来源完整性 |

后端根：`src/test/java/org/openelisglobal/sample/service/`。本次所读 service 用例包含 Spring 事务代理/自定义模拟事务及 mocked DAO，不能写成真实 PostgreSQL 已通过。

- `SampleCollectionTransactionTest`：只采第二管、原计划与 Analysis 原子绑定、第二管失败回滚、同请求重放、重复逻辑 ID、同类型不同管、已作废条码不复用、会话/权限改变。
- `SpecimenReceiptServiceTest`：全批先验后写、第二更新/审计失败回滚、原时刻零写重放、患者/申请/管关系不符、未采集/已拒收/已开始分析/无权/版本缺失。
- `SpecimenReceiptAuditTest`：实际审计服务读旧值与新值/精确版本；审计失败不 merge。
- `SpecimenIntakeDecisionServiceTest:353–382,453,805,984–1027`：只影响一管、拒收双审计、另一管不受影响、第二操作失败不抹第一记录、当前结果准入与权限；`ReaderTest` 保留历史但不伪造旧数据验收。
- `SpecimenRecollectionServiceTest:209–239`：新增待采逻辑请求、原拒收管保持、同键不重复、源管换键也不允许第二替代、回滚/权限/审计。
- 还应复用各 command/DAO/mapping 测试；只在新查询/状态机合同新增行为测试，不写仅断言 CSS 类名的“通过”证明。

## 6. 最小页面优化候选（供主线程选择，不擅自定业务）

延续**既有 `/order/collect` 实页**，不新增第七导航域或另作假数据原型。建议首屏只承担四块：扫码输入、当前身份、当前选管/独立状态、当前可执行动作。下方保留按管事实及展开历史，恢复核验入口作为辅助操作。桌面1280×720和窄屏均需用真实组件验收。

1. **扫码定位而非扫码保存。** 明确输入是申请号/本地管码；查到申请需选择真实管，查到唯一管高亮定位。保留查询中、未知码、已处理、无权、暂不可查的不同提示；提示不自动3秒消失。仅查询不得产生签收/验收/补采写入。
2. **按事件展示当前动作。** 未采集→确认采集；已采未签收→确认签收；已签收未决定→明确选择接收/拒收并原因；已决定→显示人/时间/依据，只读；拒收→关联补采。这里是依据现有状态的呈现候选，不是按一个布尔步骤自动放权。实际每个动作仍由原服务验证。
3. **减少卡片堆叠。** 列表保留管码、类型、采集、签收、验收决定，选中行再展开当前编辑器，复用现有预览/确认而不是所有管铺长表单。患者/申请只显示一次；提交确认仍明确指向当前管。完整阻断理由保留、键盘可达。
4. **连续处理保留人工确认。** 读回确认后恢复扫码焦点；不根据“扫码成功”就移到已完成。收管批次中有冲突显示整批未确认；逐管决定完成后可明确选下一根。新操作不得替换草稿或未知提交，有限的本次扫描记录仅留当前页内存，不持久存患者内容。
5. **现成目录可选，无法确定的不要假设。** 拒收原因直接复用现有有效版本目录；日期采用现有可用日期控件并保留实验室时区。采集人当前是人工字段，不能直接以登录操作者替代真实采集人，也未核得可靠人员目录；人员下拉不作为本批必做前提。
6. **补采显示关系和下一步。** 明确“已创建待采申请”，展示原管→新请求，保留原拒收原因；随后由实际新采集生成实管后才能签收。现标签入口保留，但打印申请级标签不能证明新管链已完成。

## 7. 可交下一代理的有限实施包与依赖

这些是原 B-01/C-01 的子批建议，不新增需求编号、不改原验收。先在主线程决定的基线核对后实施，不将此文直接当已批准方案。

### 子批一：查询身份桥接合同（B-01/C-01 前置）

- 目标：把输入码解析为当前有权查看的 sample/request/item 与新鲜事实，支持跨操作者正常交接；本人未知开单回执仍独立。
- 必读/复用文件：`OrderSearchRestController.java`、`EntryCurrentStateReader.java`、`EntrySubmissionService.java`、`SpecimenIntakeDecisionReader.java`、`SpecimenReceiptDAO.java`、`OrderEntryActorGuard.java`、`UserService` 真实Test授权助手。
- 限定改动建议：一个新的专用只读 controller/service（名称待主线程定）、从 reader 提取共享当前事实装配（原 recoverCurrent 合同保留）、对应查询授权/身份/歧义/失败测试。初批**不改** receipt/intake/recollection 写入规则、旧回执所有者、数据库状态枚举。
- 明确旧数据边界：无 SampleTypeRequest、无开单回执、分装、外部条码不唯一等不能补造；可以明确只读/不支持。本地申请号含点时不得字符串猜管。是否查询整申请或仅授权目标管必须定合同；现 reader 要全部 Test 授权，不能借部分授权泄漏其他组的患者与项目。
- 阻塞性测试：开单者A/合法接收者B、无权C；同类两管；假/重码；外部码冲突；患者关系变更；已拒收/作废；请求失败不是空；无匹配不返回旧患者；原UUID恢复所有者仍拒绝其他人。

### 子批二：现有实页的操作壳（B-01）

- 前端有限触点：`order/steps/OrderCollect.jsx`、`BarcodeScannerBar.jsx`、`OrderWorkflowLayout.jsx`、`OrderContext.jsx` 的**限定查询状态/操作适配**、`order-workflow.scss`；需要时抽一个实际操作区组件，复用 `RecoveredReceiptEditor`、`RecoveredSpecimenDecision`、`RecoveredCollectionEditor`，不复制整套业务 helper。
- 老恢复 helper 多处要求 `{receipt,current}` 与 submission checkpoint，**不能把普通查询包伪装成回执**。如抽取当前事实投影/操作适配，原恢复核验代码继续存在并定向回归。一次不重写 2400 行 OrderContext，不顺便修改 App/Utils。
- 先展示经授权查询+选管+当前事实+明确动作；若 A-01 写身份合同尚未落地，该候选只能标“查询/布局已验证、写链待验证”。不能因单账号能点击就关闭 C-01。
- 核验：1280×720关键身份/动作可达、窄屏无页面横向溢出、键盘扫描/选择/确认/回到输入；真实未载入/无匹配/失败/部分已处理；受限原因完整。保留对应实页前后截图，不另做新原型。

### 子批三：连续操作与真实独立事件验收（C-01）

- 依赖：子批一、二及 A-01 对所用写入口的身份/未知提交合同；Q-03 未定时继续分开按钮、分开事件，只验现有 Reception 角色的合成场景，不命名为某医院制度。
- 有界实现：10管当前任务记录、明确成功才推进、焦点与重复提示、未知提交恢复、补采到新采集的关联入口。复用现有写事务；不加一键“采集+签收+验收全部完成”。
- 必须运行的最小场景：十管跨申请连续；同管重复；未知码/超时；同申请两管一接收一拒收；一管提交成功第二管冲突；多管签收批次回滚；补采完整链；多标签身份/撤权/草稿/未知刷新；各事件与审计逐项读回。
- 验证层次：相关前端定向 → 受影响后端服务/查询测试 → 任务专属合成数据库的真实持久回读 → 真实浏览器按同候选执行与截图 → 根门禁/提交/部署核验。每层分别写实际结果，不把mock测试当医院验收，也不重复启动无关容器。

## 8. 下一步与不可下的结论

建议主线程在 A-03 当前候选验收后，先冻结**专用查询桥接合同**再派开发。可以同步做现有 collect 页紧凑布局草案，但在真实安全查询与身份依赖解决前不启用自动推进写入。

本轮已能交接：准确入口/服务位置、原子性边界、已有断言、缺口、有限触点及阻塞性场景。没有证据称 B-01 或 C-01 已完成；没有新测试成绩、部署或截图。完整医疗机构岗位、设备实际扫码器/打印机、外部条码/HIS及真实用户验收仍为外部待验。
