# A-01 写入会话与 CSRF 合同：有界只读核查

日期：2026-09-23。当前可读树 `/private/tmp/lis-active-20260923/delivery-worktree`，HEAD `3e1e3b402f`；树中另有已冻结的首页读态修复与 A-03 候选。保全来源 `/private/tmp/lis-active-20260923/working-files-preserved`，兼容性依据 `a01-preserved-session-compatibility-review.md`。

本次只读产品、保全资产、现有测试及本机 Spring Security 6.2.8 依赖字节码；没有临床写入、换账号实验、测试运行、构建或产品修改。本文件是原 A-01 的待核查实施合同，不另立需求编号，也不宣称院方制度已经确定。

## 1. 结论

**不能仅删除前端 CSRF 相等比较，也不能直接恢复保全 App/Utils。** 应先为选定写入口补齐“页面确认身份与本次服务器身份一致”的强制合同，再以小范围会话核验和业务 transport 接入替换误停条件。

现有后端已有权限、事务、对象版本和签名保护；多数绑定的是请求到达后解析出的当前操作人，而不是页面确认意图时的操作人。没有在本次核查路径发现客户端 expected user/session 字段或请求头合同。两者并不等价：如果页面确认 A 的意图，实际发出时 cookie 已变成 B，后端仅从 cookie 绑定 B 不能独立证明用户仍在确认原来的意图。CSRF 可能阻止这种变化，但应作为请求防伪凭据，不能替代明确身份边界。

审核比其他路径多一层真实服务端查询绑定：queryId 属于 HttpSession 中保存的 actor 与页面快照，不应忽略这个已有能力。结果普通保存、报告、申请等仍需逐路补足，不能用一个“已检查登录”的前端布尔值宣布全局安全。

## 2. 已确认的令牌事实，及未证明的事项

运行布尔证据 `a02-session-rotation-runtime.json` 只证明：连续三次同账号、同 sessionId 的 `/session` 读取，csrf 字符串不同。Spring 默认 XorCsrfTokenRequestAttributeHandler 会对同一底层令牌生成不同随机掩码；这不代表会话失效，也**不证明跨账号后旧底层令牌仍然有效**。

当前 FORM 配置的 `.sessionFixation().migrateSession()` 与 CSRF 都启用，只有 ValidateLogin 被忽略 CSRF 请求匹配。实际 6.2.8 jar 字节码显示：

- CsrfConfigurer 为 SessionManagementConfigurer 加入 CsrfAuthenticationStrategy；成功认证时，若已有 token，则 `saveToken(null, request, response)`，再加载新的 deferred token。
- CsrfConfigurer 为 LogoutConfigurer 加入 CsrfLogoutHandler；登出时 `saveToken(null, ...)` 清底层 token。
- 当前自定义 CustomFormAuthenticationSuccessHandler、CustomSSOAuthenticationSuccessHandler 设置业务 UserSessionData/返回或跳转，没有自行复制或恢复旧 CSRF。

因此，从 FORM 的源码及实际依赖看，预期成功认证会更换底层 token，登出会清除；不能报告“当前系统已经证实跨账号保留 CSRF”。SAML/OAuth 链也没有自定义 CSRF repository/handler 覆写，采用框架链的认证/登出策略，但本次未运行实际 IdP 路径、未验证选中的实际过滤链或代理跳转。另看到 OAuth success bean 返回 CustomFormAuthenticationSuccessHandler 而 SAML 返回 CustomSSOAuthenticationSuccessHandler，SSO 完整业务会话初始化需按原外部待验收边界单独确认，不能用 FORM 结论外推。

`LoginSessionFixationTest` 只加载独立 TestConfig：成功测试断言 JSESSIONID 改变；失败测试也不验证 CSRF。它没有载入真实 SecurityConfig/自定义登录 handler，没有核对旧底层令牌拒绝、登出清理、同用户重新登录、跨账号或 SAML/OAuth。现有测试不能证明整个系统的底层令牌生命周期。

**结果保存已经显式传入 `submittedSession.csrf`**：UnifiedResults 的保存边界把这个捕获值交给 resultEntryTransport，后者放到 X-CSRF-Token，不是临发出时随便从共享 storage 抓一个新值。这项保护应保留。如果底层 token 在某认证边界意外未轮换，旧掩码仍可能被验证；如果正常轮换，它也只是额外防线。两种情况都不能把“前端捕获令牌”当作服务器 expected actor/session 合同。

## 3. 当前前端与保全设计的影响范围

| 区域 | 已读真实位置与行为 | 最小处理边界 |
| --- | --- | --- |
| 全局会话读取/登录 | App.jsx 的 getUserSessionDetails 写共享 CSRF，无请求代际；Login.jsx 成功后 await refresh 后导航 | 只接 reader/lifecycle/登录桥接；不覆盖整 App，不夹带存放或菜单变化。 |
| Results | resultEntryState.ts 的 entrySession/sessionReady；完整 stamp 含 csrf，且 storage 与 csrf 必须相等；UnifiedResults 按 stamp/phase 挂起草稿，身份改变清私有状态 | 将稳定归属与请求凭据拆开；仍保留行、版本、编辑修订、未知提交及签名守卫。 |
| 结果签名与保存 | resultSignatureApi.ts 捕获 username/userId、row、csrf、guard；签名和普通保存是两个独立请求；普通保存 onSign 没把电子签名 ID 作为保存载荷 | 两个发出边界都需 expected actor/session；不能称已有跨请求原子签名保存。保持 uncertainOperation=signature 与不重放规则，不顺便重构签名业务。 |
| 审核 | ReviewSubmissionButton.jsx 的 binding 含整个 userSessionDetails+storage token，回调还比较 token；reviewTransport 捕获 csrf | 不以正常掩码轮换销毁用户决策；保留 queryId/完整 issued page/签名内容绑定及单次消耗。 |
| 报告 | reportWorkspaceState.ts 复用 sessionReady，轮询/窗口事件触发检查；patient-report-release-api.ts assertReportRequest 再比较 storage token | 草稿/冻结/发布/作废/打印均为相关写面，报告 GET 也会被同一比较误停。先分类读写，不能解除全部 assert 后认为发布安全。 |
| 申请与采收 | OrderContext.jsx 已按 userId+sessionId 隔离草稿，支持可选 provider generation；收验/重采/QA 等 transport 捕获 token；部分旧分支仍用 Utils | 保留现有 operationId/idempotency/receipt 归属；逐个选定入口迁移。storage-skipped 的旧直接 PUT 不会因新 Provider 自动受保护。 |
| 旧通用写与发送 | Utils 多处从共享 storage 取 token，403 CSRF 会触发 reload；保存后的 FHIR/通知有既有 after-commit 边界 | 不在本批重写所有 helper。列未迁移路径为剩余面，禁止全局放开后声称全部写入安全；手动发送/重发的全部端点未在本轮盘点。 |

保全 useSessionBootstrap 的 getSessionIdentity 已使用 userId+sessionId；但 isSessionWriteAllowed 第约277行仍要求 storage token 与 details.csrf 相等，run 成功还向共享 storage 写每次新掩码，storage 变化设 failed/unverified。**它本身也需要修正，原样恢复不能解决本次实证问题。** 可复用取消、单次核验、phase、pause/resume、失败保留旧页面但关闭写入等骨架，不能原样复用令牌相等即身份新鲜度的判断。

原兼容性说明中的 Login bridge 缺口仍成立：失败后普通 refresh 被保全 hook 阻断；当前 Login 没有正确的 pause/resume、同步提交锁和核实成功后导航合同。SecureRoute 当前 idle 提示卸载子页面也会丢临时输入；这必须作为生命周期接入的一部分验收。当前首页只读修复的两个 `/session` 核验不是可直接套用到写入后的保护：写请求执行以后再确认身份已经无法撤销业务副作用。

## 4. 后端现有真实防线与 expected actor 缺口

| 写面 | 已有可复用防线 | 没有据此证明的能力 |
| --- | --- | --- |
| 首次申请/申请回执 | EntrySubmissionService 用 OrderEntryActorGuard.bind，回执 createdBy/Idempotency-Key/指纹；OrderEntryActorGuard 检查实际 Authentication、principal、启用账号、HttpSession、legacy identity、角色/检验组，注册 beforeCommit 复查 | bind 入口只收 request，BoundActor 是请求当前 actor；未与客户端页面期望 userId/sessionId 比较。幂等回执能拒绝 B 读取 A 的已存在回执，不阻止一个全新 operation 在 B 名下首次写入。 |
| 收管、验收、重采 | SpecimenReceiptService、SpecimenIntakeDecisionService、SpecimenRecollectionService 均调用同一 actor guard；另有实管图、状态/evidence digest、逐检验授权、操作回执和事务验证 | JSON 命令的字段白名单无 expected user/session；不可简单向现有 body 塞字段。当前 bound session 多处比较对象相等，未固定客户端期望的 sessionId 字符串。 |
| 普通结果 | ResultEntryRestController 单 analysis 路径与 body 匹配；LogbookPersistServiceImpl.saveSingleResult 取当前 userId、绑定 request.getSession(false)、多次 verifyActor；检验授权、标本状态、analysisLastupdated、请求对象一致性，beforeCommit 再验证 | SingleResultEntryForm 只有 testResult。actor 在请求内绑定而非页面时点；Session ID 迁移/另一账号在请求之前生效不由此合同解释。 |
| 审核 | AccessionValidationRestController 先用 ReviewQueryContextService.consumeForSave；queryId 存 HttpSession Context(actor,criteria,rows)，当前 actor 必须匹配，原 issued page/版本/权限复核后原子消耗；ReviewSubmissionService 事务内复查 session/actor/启用状态，签名与修改同事务 | 这是已存在的服务器签发上下文，不是纯客户端校验。但 Context 没保存 sessionId；FORM migrateSession 可迁移非安全业务属性，同账号新会话是否带旧 queryId 必须回归。不能把 queryId 当所有写面都有的通用许可。 |
| 电子签名 | ElectronicSignatureRestController `/sign`、`/certify` 要求 body.username 匹配当前 Spring Authentication；service 检查密码/认证并保存 signerId/record type/id；审核/报告使用内容快照签名 | 阻止请求 body 指定另一个用户名，但未约束页面原 sessionId；通用签名 service 的 activeSessions 以 username 计数，不能拿它当 HTTP 会话身份。结果的签名/结果保存仍是不同事务请求。 |
| 报告文档 | ReportDocumentRestController 从 request 取 actor；service 校验 persisted scope、冻结哈希、当前结果内容、签名 actor/record/content，发布签名/PDF/状态同事务；旧 unbound legacy issue/void 明确拒绝 | IssueRequest/其他命令未有页面期望 actor/session，service 参数只有当前 actor，没有完整 HttpSession 前后绑定。密码校验和冻结内容不等于用户仍在原会话确认。打印也是有记录副作用的 POST。 |
| QA | SampleQaChecklistServiceImpl 已有 QaChecklistWriteGuard、确认指纹与 verifiedBy | 本次只确认其接入，不宣称完整读过每条内部授权/发送分支；应在其被选作迁移批次时做精确期望身份适配。 |

本轮未做攻击性运行实验；“缺少显式期望身份”是合同与实现缺口，不等同于证明现有 CSRF、权限或签名保护全部无效。

## 5. 最小可执行合同（候选）

### 5.1 分清四类对象

1. **页面/草稿/签名意图的归属**：稳定 `(userId, sessionId)`，再加业务对象标识、已读取版本、编辑 revision、queryId/operationId。姓名、loginName、条码、CSRF、前端角色列表不能替代身份。scope（roles/loginLabUnit/userLabRolesMap）是新鲜度条件，不是前端授权来源。
2. **核验代次**：一次服务器身份核验的 generation，决定旧回调是否还有效。核验失败时关闭写入能力，但不把同归属草稿当别人的数据或自动清除。新成功核验需要显式重新绑定当前意图；不能把所有旧回调一并复活。
3. **CSRF**：该次已验证会话给出的请求凭据，临时保留于内存并随明确请求传入；正常掩码变化不改变草稿所有者。不得从别标签的新 token 值自动推断“已核实同一账号”。
4. **持久回执/未知提交恢复**：服务器按创建 userId、operationId、对象/指纹授权；重新登录同一人可手动核对已提交记录，但不自动恢复旧 session 的签名/发送资格。前端只保留现有最小恢复标识，不把密码、患者正文或 sessionId 新增到 localStorage。

### 5.2 发出之前和后端的两道边界

**前端候选 prepareWrite**：在用户已经确认一次明确操作之后、真正 fetch 之前进行有界无缓存 `/session` 核验，比较原意图归属与权限范围；匹配后为这一次请求生成不可重复使用的内存许可，含稳定 expected actor/session、当前凭据、generation、操作/对象/revision。读取本身不写共享 storage，避免令牌乒乓。核验期间暂停同意图的重复发送；账号或 scope 改变不自动用新身份重新签发旧操作。所有异步等待结束、签名 modal 确认和实际 dispatch 处再查许可及原意图仍一致。

**服务器候选**：选定写入口增加强制 expected user/session 一致性合同。最小可利用现有 `/session` 字段：例如请求头 `X-LIS-Expected-User-Id`、`X-LIS-Expected-Session-Id`（候选名称，尚未实现）。它们只是客户端意图约束，**不得用于创建/选择 Authentication 或授予权限**。用当前 Spring principal、业务 userId 与 `request.getSession(false).getId()` 进行独立比较，不匹配/缺失/无会话在任何签名、query 消耗、幂等 claim、审计或业务副作用之前拒绝。请求头不得记日志、不得回显，不放 URL。若后续以会话绑定不透明 handle 代替原 sessionId，必须仍映射到同一服务器 actor/session，不与 CSRF 混用。

通过后得到服务器不可变 BoundWriteContext，事务服务使用同一个 actor/session 标识和现有真实角色/检验项目授权；在变更前、提交前重验账号/会话/相关授权与对象版本。不能直接把 ROLE_RECEPTION 专用 OrderEntryActorGuard 整体用于 RESULTS/REPORTS；应抽取身份一致性最小能力，岗位判定仍留现有正确领域 guard。审核在消耗 query 前校验；报告/签名在产生签名和 PDF/计数之前校验。

这能关闭“前端核验 A 后 cookie 变 B、请求以 B 到达”的窗口；一次 GET preflight 单独做不到。CSRF仍由 Spring 正常验证，既不禁用也不在浏览器自行解码。

### 5.3 严格撤权/登出并发边界不能夸大

服务器 request 内捕获 actor 加 beforeCommit 检查不是全系统的并发撤销锁。如果要求“撤权或登出已先完成，则在途写也一定不能随后提交”，撤权/登出与写事务必须共用可串行化的失效代次或锁协议，且所有相关修改权限的路径都参与；仅前端 generation、仅 HttpSession 对象相等、或在 SERIALIZABLE 事务旧快照中再查一次权限都不能独立证明这个性质。

最小验收应明确线性化点：写请求身份/权限最终准入与会话撤销按服务器定义排序；已被接受且完成提交的请求不能被前端 abort 当作回滚。若本批未实现跨节点撤销代次/共同锁，就保留该严格并发命题为未验收，不把读态 A-02 的前后检查套在 POST 后声称等价。先完成“请求到达时 expected 身份必匹配”有界合同，再按需要补当前认证边界的撤销参与；不为此立即引入 Redis 或微服务。

### 5.4 草稿和不确定写入

- 同账号同 session 的掩码轮换、短暂核验失败、idle 提示：保留组件及临床草稿，暂停写入；成功重新核验并确认对象仍可编辑后手动继续，不自动重发临床操作。
- 另一账号/显式退出：立即遮蔽原临床内容、取消旧 UI 回调和签名密码；绝不把原草稿直接交给新账号。草稿如需保留，只能在原归属隔离区且不得被新账号读到；当前 Results 的 clearPrivateState 会清内存草稿，不能宣称这部分已具备保全恢复。
- 已 dispatch 后超时、取消、权限/会话变化、响应体不完整：保留 pending/unknown，不宣告未发生或保存失败后自动再发。沿用原 operationId/查询回执、版本读回等手动恢复途径，不能重新生成 key 再送一次。
- 浏览器完全退出后的临床草稿持久恢复没有本轮证据；不能把“同页临时失败不丢”扩写成“任何退出都不丢”。报告/申请已有最小恢复元数据可复用，不能为方便存储患者正文或密码。

## 6. 按依赖推进的 A-01 候选顺序

所有步骤仍属 A-01，以下不是新的总批次承诺。

1. **先固定并验证服务器身份期望合同，建议首选普通结果保存与对应 `/esig/sign`。** 加最小 guard 与严格请求绑定，复用原 ResultSpecimenWriteGuard/版本/签名角色规则；补两类实际 controller/service 拒绝测试。不会迁移的旧客户端不可通过“headers可选”绕过本次保证。先使用能力版本或受控部署窗口，未确认后台支持时新前端保持写关闭；不能先放宽前端再等待后端。
2. **接有界会话 reader/lifecycle 与 Login 桥接。** 修改保全 hook 的 token 假设，利用 no-store/小体积/取消/timeout，分清身份、scope、核验代次和凭据；App 只选 Provider/登录退出接缝，SecureRoute 保持同身份表单挂载。同步 Login pause/resume/同步提交锁/身份成功才导航。暂不接 ApiRequestNotice、不替换 Utils、不带 StorageCreateProvider。
3. **迁移结果的读写边界。** GET 用类似首页验证的稳定身份边界；写在明确操作发出前取得许可，传服务器 expected 身份和捕获 CSRF。保持临床草稿归属、签名/编辑revision、0值、未知提交和服务器对象规则。正常 mask 轮换不得导致重新登录或丢输入；不能因新的凭据把旧签名回调解锁。
4. **审核，再报告。** 审核优先复用 queryId+actor+session 的服务器上下文，补显式会话epoch/迁移测试；报告逐项覆盖 prepare/draft/freeze/issue/void/print，不把已有冻结哈希、内容签名和权限链拆掉。每一写面独立验收后才移除它的旧 token 身份比较。
5. **申请/收验/重采/QA与其他写入口。** 复用 OrderEntryActorGuard/回执，补期望身份入参及局部 transport，不整包回填 OrderContext。未迁移旧 Utils 路径/发送、标签、基础配置逐项保留范围，最后才处理全局错误适配与其他弱回调。

若首个结果写入口暴露必须先完成统一 provider 的依赖，可将第1和第2步作为同一受控交付中的前后端子件，仍应先红测后端、最后才打开新前端写能力。实际未完成任何一步前，现有保守拒绝继续保留。

## 7. 最小阻塞性验收矩阵

| 场景 | 必须观察的结果 |
| --- | --- |
| 同 userId/sessionId 两标签获得不同 XOR mask，含首次登录 | 可正常读与在重新核验后执行一次明确写；不循环 token 写回、不错误退出、不丢同页输入。 |
| preflight A 后、dispatch 前变 B；测试故意给 B 合法 CSRF | 服务器因 expected A/B 不匹配拒绝；业务 setter、签名、打印计数、query consume、幂等 claim、外发调用均为0。这个反例不依赖底层旧 token 是否恰好失效。 |
| 同一账号重新登录，sessionId改变；migrateSession带业务属性 | 旧写意图/query/签名不能自动重用；已有回执只经重新授权手动核对。 |
| 同一底层 CSRF正常换mask与真正成功登录轮换底层token | 分开断言：前者旧mask可仍合法但不影响身份；后者旧token拒绝、新token可用。必须在真实SecurityConfig相关链的隔离测试证明，不能只看JSESSIONID。 |
| 写前撤权/锁账号/切检验组 | 当前真实后台岗位/项目授权拒绝，不信客户端 roles；无副作用。严格在途撤权按第5.3节共同协议另验证，不夸大旧事务检查。 |
| 原页面读取/签名返回晚于换账号或核验generation | 不回写token、患者、签名、toast成功或导航；不自动重发。 |
| 核验挂起、storage不可读、匿名302/HTML/401、403 | 未知/禁止写，临床内容按身份边界隔离；明确失败不假装0或已保存，不强制 reload 清草稿。 |
| 输入0、同管邻近analysis可写、受拒管不可写 | 原准入与版本规则不变；身份修复不升级/放宽业务规则。 |
| 签名已发但未知、保存已发但读回未知、打印已发但未知 | 只出现一次写请求；保留原未知状态和恢复标识，后续仅人工核对，不能新生成操作重发。 |
| idle/手动重核/FORM成功失败/SSO候选 | 同身份保持页面输入；登录桥接取消旧GET并等待真正新身份；真实SSO没有资料或环境时明确未验，不外推。 |

本轮只给核查与候选合同，不开启任何临床写入，不解除旧保护，不关闭 A-01。
