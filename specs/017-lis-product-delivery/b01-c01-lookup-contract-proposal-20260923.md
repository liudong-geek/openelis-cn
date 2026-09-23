# B-01 / C-01：日常标本查询桥接的有限实施合同建议

日期：2026-09-23。**性质：只读核查后的待确认实施合同；尚未实现、未运行测试，不是 B-01/C-01 已完成证明。**

来源基线：`3e1e3b402fc549236c28446cc53cd652c913385b`，分支 `feat/017-lis-product-delivery-m1-report-foundation`。依据 `specs/017-lis-product-delivery/b01-c01-collection-reception-audit-20260923.md`。本次补核的 sample / sampleitem / barcode 目标源码未出现在工作树改动中；主负责人同期合入的审核候选未被本任务改动。以下源码路径均相对正式仓库。

## 1. 建议冻结的最小范围

新增一个**独立、只读、按当前操作者权限查询**的接口，供现有 `/order/collect` 后续接入。输入临床申请号或本系统真实临床实管码，返回唯一申请、可明确定位的实管/逻辑管关系及当前事实。查询不创建、不采集、不签收、不验收、不补采、不生成标签，不产生成功开单回执。

必须同时保持三条边界：

1. 日常接收人员可以按自己当前 Reception 及所涉 Test 权限查询其他开单人的申请；不要求知道原提交 UUID。
2. `EntrySubmissionService.recover/recoverCurrent` 的原回执所有者检查、原始申请/患者/请求身份及原始 Test 检查全部保留。新接口绝不伪造 `{receipt,current}` 调用旧恢复链。
3. 本子批只交付查询和事实；即使全部定向测试通过，也不关闭 C-01 十管连续写入验收，更不声称 A-01 跨请求读写身份合同已经解决。

首批范围明确为**本系统临床申请号 / 本地临床实管码**。环境、外部码、分装码不进入隐式回退。没有首次回执本身不是失败条件；当前关系完整的旧申请仍可正常只读查询。

## 2. 已核实的编码与权限事实

| 已核事实 | 实际文件 / 位置 | 对实施的约束 |
| --- | --- | --- |
| 临床实管标签以 `labNo + "." + sampleItem.sortOrder` 生成 | `barcode/labeltype/SpecimenLabel.java` 临床构造器约234行；`barcode/service/BarcodeLabelGenerationServiceImpl.java` 约83–108行 | 必须定位实际 SampleItem，不可用逻辑请求行号冒充实管 |
| 新标签生成服务校验真实实管所属申请、非作废/拒收、序号合法且本申请唯一，并核验渲染器返回的码完全一致 | 同上；`validSortOrder` 为 `[1-9][0-9]{0,4}`，最终标签码最长30 | 标签生成时的资格不等于历史查询条件；查询历史拒收/作废管时仍可显示真实只读状态 |
| 通用/环境构造器优先使用实管 `externalId` | `barcode/labeltype/SpecimenLabel.java` 约338–343行 | 不能把外部码宣称为已支持；不得失败后自动按 externalId 模糊查找 |
| 申请号允许点 | 现有入参合同，例如 `sample/form/SpecimenRecollectionCommand.java` | 不采用 `lastIndexOf('.')` 截断后直接认定申请/管；完整申请号可能与另一根管码相同 |
| `BarcodeLabelInfo` 仅有 code/type/numPrinted；`SampleItemBarcodeInfo` 只是管的期望/计数信息 | 两个现有 valueholder | 没有可靠的“打印码→实管”身份注册表可直接复用；生成计数不证明实际打印/贴管 |
| 旧 `SampleDAOImpl.getSampleByAccessionNumber` 返回列表第一条 | `sample/daoimpl/SampleDAOImpl.java` 约250–264行 | 不可拿该方法作新入口的唯一性证明；新增有界候选查询必须检测重复 |
| `SampleItem.sortOrder` 为数值字段的 String 自定义类型 | `src/main/resources/hibernate/hbm/SampleItem.hbm.xml` 约20行 | 查询拼接/参数类型须以真实 ORM 验证，不能只靠 Java 字符串模拟通过 |
| 当前 reader 要求整申请的逻辑请求检验 + 全部实管 Analysis 检验；后者包含取消状态 | `sample/service/EntryCurrentStateReader.java` 约176–267行 | 不能只检查选中管或一个检验组后返回整个申请的患者和其他组项目 |
| 现有 actor guard 校验当前账号、会话、登录实验室、真实权限源及事务结束身份一致 | `sample/service/OrderEntryActorGuard.java` | 复用已有 Reception / GlobalAdmin 角色门槛；GlobalAdmin 路径不新增绕过所涉 Test 授权的特例 |

## 3. 建议 API 与返回合同

建议路径：`GET /rest/specimen-intake/lookup?code=...`。它与写端点 `specimen-receipts`、`specimen-intake-decisions`、`specimen-recollections` 分开，命名可由主负责人在冻结时统一。

只接受 `code`，不接受 actorId、patientId、sampleId、requestId、workflow 或权限范围等客户端授权参数。输入去除扫描器首尾空白后，保留大小写、内部点/横杠/下划线和数字原值；不去前导零、不模糊匹配。按当前本地标签合同限制字符及长度（最多30），非法输入400。范围外历史码明确为不支持，不能靠放宽解析猜测关联。

建议成功 DTO：

```text
SpecimenLookupResponse {
  version: 1,
  source: "specimen_lookup",
  readOnly: true,
  matchedKind: "order" | "specimen",
  selection: {
    sampleId: positive-id-string,
    sampleItemId: positive-id-string | null,
    requestId: positive-id-string | null
  },
  current: EntryCurrentStateReader.Snapshot,
  generatedAt: server UTC ISO instant
}
```

- 查到申请：`sampleItemId/requestId` 均为 null。只选申请，不默认选第一管或全部管；页面随后可从真实 `current.requestedSpecimens` 中选择。
- 查到实管：这三个 ID 必须来自同一数据库快照，且实际实管只能对应**一个** COLLECTED 逻辑请求。不能因为 typeOfSample 相同就绑定，也不能按数组索引绑定。
- 未采集的 REQUESTED 逻辑请求没有实管码。即使 `labNo + logical.sortOrder` 看似合理，也不得识别成实管；只能在已查到的申请内按真实 requestId 选择逻辑管。
- `current` 保留原始状态、版本、患者身份、逻辑/物理关系、QA、逐管验收、准入阻断及目录事实。历史 ACCEPTED 不推导为当前可录入，收管时刻不推导为已验收。
- DTO 不含 receipt、submissionId、requestHash、首次开单成功标志或写入令牌；不能传给 `adoptRecoveredEntry`。所有返回都是观察事实，不是绕过写服务的授权凭据。
- `Cache-Control: no-store`；错误同样 no-store。日志不输出临床应答、患者信息、完整扫码内容或会话凭据。

建议稳定错误码：400 `SPECIMEN_LOOKUP_INVALID_CODE`；404 `SPECIMEN_LOOKUP_NOT_FOUND`；409 `SPECIMEN_LOOKUP_AMBIGUOUS` / `SPECIMEN_LOOKUP_STATE_CONFLICT` / `SPECIMEN_LOOKUP_LEGACY_READONLY` / `SPECIMEN_LOOKUP_UNSUPPORTED`；401/403 维持现有认证/授权语义；配置或数据源不可用返回明确5xx，不变成404或成功空对象。错误不返回候选 ID、候选患者或其他临床详情。

## 4. 精确解析：检查真实候选，不猜拆字符串

建议两类候选在同一只读快照中分别查询，最后取并集：

1. `Sample.accessionNumber == 输入码` 的全部精确申请身份。
2. 实际 `SampleItem` 与所属 `Sample` 组成的**真实临床管码**完全等于输入码的管身份。没有实管记录就没有这个候选。

避免全库字符串扫描的可实施方式：将完整输入及输入中每个点前的有限前缀作为**候选申请号检索键**，以精确 `IN` 查询定位申请，再对这些申请的候选实管做真实字段精确条件查询和服务端重建码复核。这些前缀只是有界数据库检索键，不能直接变成认定的身份；最终必须由真实 Sample/Item 字段组合完全相等证明。30字符输入带来的候选键有明确上限，SQL 参数化；只投影身份/编码/域所需字段。若选择等价 HQL/SQL 拼接方案，必须证明数值自定义类型和索引查询行为，不用加载全部患者/全部申请筛选。

候选查询最多需要证明“0 / 1 / 多于1”，可分别限取2个不同身份；不能先 `LIMIT 1` 后装作唯一。发现数据异常或资源上限时明确失败，不返回截断后的第一条。

- 无候选：404。
- 一个候选：继续当前关系和全部 Test 授权检查。
- 多个不同候选：409，不能优先选择有权候选、最近申请、活动管或数组第一项。完整申请号与某实管码相撞也属于歧义，即便它们可能属于同一个申请仍不隐式决定操作对象。
- 两根实管同 sortOrder，或者两个不同申请有相同 accessionNumber：都不能随意命中一根。当前临床域配置异常也不当作无匹配。
- 已作废/拒收记录不从唯一性检测中偷偷排除；唯一的历史管可只读显示对应状态，不自动开放操作。
- 不增加 externalId、样本类型名、患者名、历史标签计数的回退搜索。

## 5. 当前权限与事实装配边界

建议 service 使用现有 `EntryRecoveryTransactionManager.BEAN_NAME` 的**独立 REQUIRES_NEW / REPEATABLE_READ / readOnly** 边界，复用 `OrderEntryActorGuard.bind(request)` 并在装配结束和既有 beforeCommit 校验点 `requireUnchanged`。该事务管理器拒绝借用 OSIV-only EntityManager；不能通过清空/关闭他人上下文来“解决”。实施测试必须验证实际新 HTTP 路径能取得新上下文；本次目标配置检索未发现额外 OSIV 声明，不把此有限检索当成运行证明。

处理顺序建议：当前 actor → 码的唯一真实身份 → 当前关系/检验 ID 收集 → 所涉 Test 全授权 → 患者/详细事实投影 → actor 结束检查。不要由 controller 遍历实体或组织权限政策。

整申请 Test 集合包含所有当前逻辑请求的 requestedTests、所有真实实管的全部 Analysis.test（含取消等历史状态）。使用 `getAllDisplayUserTestsByLabUnit(actorId, Constants.ROLE_RECEPTION)` 的现行授权政策；所有被返回的检验都必须在允许集合内。任何一项无权即整请求403，不返回“其他组已隐藏”的不完整申请。null、非法 ID、目录/配置读取失败不能默认为空授权或空申请；合法空授权只会得到拒绝，不放行。

同一数据库事务保证本次读快照，不能声称它冻结进程内配置或之后的写操作。已有 guard 的身份/角色检查保持原义；不擅自新增与其他模块不一致的授权政策。

建议最小提取：

1. `EntryCurrentStateReader.read(original, actorId)` 保留为原回执入口包装。继续校验原 sample/labNo/workflow/patient、原请求 ID、原始 requestedTests 及所有当前事实；原所有者仍由 `EntrySubmissionService` 检查。
2. 抽取内部 typed 当前事实装配，接收服务器已解析的当前申请身份与校验策略，不接受客户端/伪 JSON “原回执”。日常查询使用当前患者唯一合法关系，不声称它证明“创建时患者关系从未改变”；旧回执包装仍能按原 patientId 检出变化。
3. 当前逻辑请求、实管、Analysis、状态、版本、数量和类型关系的严格校验继续共用。先保留原行为，避免写一个较宽松的第二套 reader。
4. 装配患者详细资料和逐管 QA/验收前完成整申请 Test 授权。复用 `SpecimenIntakeDecisionReader` / `OrderQaReviewReader` 等现有读投影，不重算临床准入算法。

### 旧数据的有限只读含义

- **没有首次回执，但当前请求/实管/患者/检验关系完整**：正常成功；不补造回执，不限制原开单者。
- **历史目录已停用但 reader 支持保留其真实事实**：原样只读展示停用/缺名状态，不用当前目录反写历史。
- **没有 SampleTypeRequest、实管未关联逻辑管、存在分装或不完整历史关系**：本首批返回明确 `LEGACY_READONLY/UNSUPPORTED` 限制，页面说明“旧申请只能查看，当前操作工作区暂不支持”，不给可编辑 current，不伪造逻辑管、采集人、签收或验收记录。原系统已有只读查看入口保留。不得把缺少原逻辑关系的对象塞进正常 Snapshot。
- **多个患者关系、错误父子关系、重复/断裂 ID、某实管对应多个请求**：明确冲突，不降级为可信旧数据。

若主负责人希望本首批额外展示“无逻辑请求的旧申请详细快照”，必须另行冻结一个独立 `legacy_readonly` 投影及完整 Test 范围证明；现有 reader 不提供该合同，本报告不把它算作免费已有能力。本建议先不增加第二种详细成功 DTO，以避免假造正常身份关系。

## 6. 具体实施触点与复用文件

下列 Java 路径相对 `src/main/java/org/openelisglobal/`。

| 触点 | 最小工作 |
| --- | --- |
| 新 `sample/controller/rest/SpecimenLookupRestController.java` | 参数、认证入口、no-store、错误映射及 service 委派；不写业务判断 |
| 新 `sample/service/SpecimenLookupService.java` 与 response/selection DTO | fresh read transaction、actor、唯一身份、权限、装配及只读应答 |
| `sample/dao/SampleDAO.java` / `daoimpl/SampleDAOImpl.java`；必要时 `sampleitem/dao/SampleItemDAO.java` / `daoimpl/SampleItemDAOImpl.java` | 新增有界精确身份投影查询，不改变旧按申请号首条返回方法，不加载患者关系进行全库过滤 |
| `sample/service/EntryCurrentStateReader.java` | 提取共用当前事实装配；保留原 `read(JsonNode, actorId)` 的严格原回执包装 |
| `sample/service/EntrySubmissionService.java` | 原 owner、不可变回执校验原样保留；尽量零业务改动，必须定向回归 |
| `sample/service/OrderEntryActorGuard.java`、`config/EntryRecoveryTransactionManager.java` | 直接复用，不扩新角色/新 admin 绕过，不改共享事务策略 |
| `sample/service/SpecimenIntakeDecisionReader.java`、现有 QA reader、Test 授权 helper | 复用事实/阻断/目录；只读查询不调用对应写服务 |
| `barcode/labeltype/SpecimenLabel.java`、`BarcodeLabelGenerationServiceImpl.java` | 编码事实依据；本批不改打印/计数/模板，不引入新编码格式 |

暂不变更 receipt/intake/recollection 的 command、写事务、状态枚举、审计或数据库结构。新读查询若要求索引，先看实际执行计划再单独说明迁移，不能凭 schema-only 测试库推断生产索引已够用。

前端后续接入可限定在 `frontend/src/components/order/steps/OrderCollect.jsx`、`BarcodeScannerBar.jsx` 及单独 lookup 状态/组件；不调用旧 `loadOrder` 原地替换草稿，也不一次重写 OrderContext。查询中、未知、无权、冲突、暂不可查分别呈现；迟到响应不得替换新患者，查询失败不能把上一患者画面当本次结果。首批界面保持只读，写按钮等 A-01 和独立操作适配合同验证后再接入。

## 7. 必须增加的有限验收矩阵

以下仅是待实现测试样例，本次未运行。

| ID | 合成场景 | 预期 |
| --- | --- | --- |
| L01 | A 开单，B 当前合法 Reception 且全部 Test 有权 | 新查询 B 可读；原 UUID 恢复 B 仍被 owner 拒绝 |
| L02 | B 只对目标管有权，整申请另有无权 Test | 403，零患者/其他管详情；不因目标管授权而泄漏整单 |
| L03 | 角色无权、失效账号、登录实验室/会话切换；合法管理员但缺 Test 授权 | 现行 guard / Test 政策拒绝，不新增 admin 特例 |
| L04 | 同申请同类型两根实管，各有不同真实序号/请求 | 每个码精确选中不同 itemId/requestId；不依赖类型或数组位置 |
| L05 | accession 含一个或多个点；整申请码等于另一根管码 | 正常点号申请可识别；相撞409，不按最后一点猜拆 |
| L06 | 重复 accession、重复实管 sortOrder、多个逻辑请求绑定同实管 | 409，不取第一条，不排除历史状态后制造唯一 |
| L07 | 只有 REQUESTED 逻辑管，无实管 | 申请查询可见真实待采请求；看似管码但无 SampleItem 则404 |
| L08 | 唯一已拒收/作废实管 | 真实状态保留且只读；零采集/签收/验收/补采请求 |
| L09 | 无首次回执、但当前关系完整 | 正常只读；零 receipt 创建，无伪 submissionId |
| L10 | 无逻辑请求、未关联实管、分装、环境/外部码 | 明确旧数据只读限制/不支持；不合成正常 Snapshot |
| L11 | 当前患者零/多关系或关系不合法；原回执患者曾改变 | 当前不合法关系失败；合法唯一当前关系只证明当前；原 UUID 路径仍检出与原患者不一致 |
| L12 | 无匹配、非法/过长码、配置缺失、DAO抛错、读取超时 | 分别对应真实错误；不能成功空对象、不能回送旧患者 |
| L13 | 事务中 actor/角色变化、OSIV-only/脏上下文、外层写事务 | 结束身份检查生效；隔离读不清空/提交其他上下文；禁止 query 引发写入 |
| L14 | 旧回执包装的原 Tests / 原请求被改变或撤权 | 原恢复保护保持；不能借新装配入口绕过原始事实检查 |
| L15 | 两次快速扫码、旧响应后到、查询失败时仍有旧视图、已有草稿/未知写入 | 不错换患者、不清草稿、不盲重发；提示明确对应本次码，不自动3秒消失 |
| L16 | 查询前后数据库及请求计数 | receipt、label counter、collection、receivedDate、intake、recollection、审计行全部零新增/零修改 |

验证层次：先 service / resolver / 原恢复回归；真实 ORM 参数与唯一性；任务专属合成 PostgreSQL 的候选/授权/关系只读回读；前端新 lookup 状态定向；实际页面查询与截图。仅 schema-only pre-data 测试库不能证明完整生产外键、索引或性能。不得把 mock 返回的 list 当真实管码 HQL 已验证。

## 8. 子批交付与唯一下一步

建议主负责人先冻结第3–5节合同及第7节矩阵，再分派后端 query bridge 与前端只读接入。后端首先保证原回执回归不变，然后增加合成查询证据；前端不得在尚未落地的 API 上用假回执冒充真实工作区。

本报告没有修改实现、运行测试、操作临床库、启动 Docker、编译、提交或部署。B-01 日常操作壳、C-01 连续十管、部分失败/补采闭环及 A-01 写态身份仍分别待后续真实验收；Q-01/Q-03 和外部条码/设备制度继续待定。
