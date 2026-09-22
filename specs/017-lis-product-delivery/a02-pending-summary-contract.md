# A-02 结果待办摘要：源码核查与待实施合同

记录日期：2026-09-23

核查源提交：`5726cbe8180b8ce1b6f26224e42c7a1db3a235fc`

核查方式：只读源码与现有测试。本文路径均相对于 OpenELIS-CN 仓库根目录。

**状态：核查和实施建议，尚未实现、尚未完成 A-02 验收。** 本文不代表新增接口、计数逻辑或性能测试已经存在或已经通过。后续实施应先复核源提交及差异，并将实际测试、提交、部署版本写回交付台账。

## 已核实的事实

| 位置              | 当前行为                                                                                                                                                  | 源码依据                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 首页结果待办      | 使用 `counts.ordersInProgress`，进入 `/Results?scope=pending`                                                                                             | `frontend/src/components/home/Dashboard.tsx`                                                                                                                                                                                                  |
| 首页旧摘要        | `ORDERS_IN_PROGRESS` 使用全局 `NotStarted` Analysis 数；该分支没有应用当前用户 RESULTS 检验组过滤                                                         | `src/main/java/org/openelisglobal/common/rest/provider/PatientDashBoardProvider.java`                                                                                                                                                         |
| 实际 pending 队列 | 合并 `NotStarted` 与 `BiologistRejected`；排除 `releasedDate` 或 `printedDate` 非空的分析；按 Analysis ID 去重；加载结果行后按当前用户 RESULTS 检验组授权 | `src/main/java/org/openelisglobal/result/service/ResultEntryWorklistServiceImpl.java`                                                                                                                                                         |
| pending 响应      | 返回 `testResult` 列表和 `total = pendingResults.size()`；`total` 是展开后的行数                                                                          | `src/main/java/org/openelisglobal/result/controller/rest/ResultEntryRestController.java`                                                                                                                                                      |
| 权限入口          | pending 方法使用 `@PreAuthorize("hasRole('RESULTS')")`，用户 ID 来自请求会话                                                                              | 同上                                                                                                                                                                                                                                          |
| 检验组授权        | `filterResultsByLabUnitRoles()` 通过 `getUserTestSections()`、`getTestsByTestSectionIds()` 获得获准 Test ID，最终按 `TestResultItem.testId` 过滤          | `src/main/java/org/openelisglobal/systemuser/service/UserServiceImpl.java`                                                                                                                                                                    |
| 授权上下文        | 现有 `getUserTestSections()` 包含登录检验组限制、角色检验组与全部检验组等分支，不能另写简单检验组判断替代                                                 | 同上                                                                                                                                                                                                                                          |
| 行展开            | 一次分析可能出现多个组件行；存在父子结果跳过、多选折叠、未录组件补空和旧 primary 回退                                                                     | `src/main/java/org/openelisglobal/result/action/util/ResultsLoadUtility.java`                                                                                                                                                                 |
| 展示行身份        | `analysisId + '-' + (testResultComponentId                                                                                                                |                                                                                                                                                                                                                                               | 'primary')`；工作台拒绝重复行身份及非法 Analysis ID 的响应 | `frontend/src/components/resultPage/unified/PolymorphicResultCell.tsx`、`frontend/src/components/resultPage/unified/UnifiedResults.tsx` |
| 标本分组          | 合法 `sampleItemId` 与 `accessionNumber` 共同构成展示分组；缺合法标本 ID 时按分析隔离，不能从姓名或条码推断标本身份                                       | `frontend/src/components/resultPage/unified/ResultSpecimenQueue.tsx`                                                                                                                                                                          |
| 禁止录入行        | `restrictTubes()` 传播只读/禁止原因，不删除行；这些行仍属于当前显示队列                                                                                   | `frontend/src/components/resultPage/unified/resultEntryState.ts`                                                                                                                                                                              |
| 当前加载成本      | 两个状态查询均返回完整 Analysis 列表，loader 随后逐分析读取患者、结果、备注、字典、签名等数据                                                             | `src/main/java/org/openelisglobal/analysis/daoimpl/AnalysisDAOImpl.java`、`src/main/java/org/openelisglobal/result/service/ResultEntryWorklistLoaderImpl.java`、`src/main/java/org/openelisglobal/result/action/util/ResultsLoadUtility.java` |

因此，现有首页全局分析数、授权 pending 分析数和 pending 展示行数并非同一口径。仅修改文案或把旧 `ordersInProgress` 复制为新字段不能完成 A-02。

## 推荐接口合同（待实施）

```ts
type PendingResultSummary = {
  scope: "pending";
  state: "ready" | "partial";
  analysisCount: number | null;
  specimenCount: number | null;
  displayRowCount: number | null;
  missingSpecimenAnalysisCount: number;
  generatedAt: string;
};
```

该结构用于成功获得服务响应后的摘要状态。请求中的加载状态、401/403、网络失败或无效响应由客户端独立表示，不转换成成功的空队列。

### 数量定义与首页使用

- `analysisCount`：同一实际授权 pending 队列中不同合法 `analysisId` 的数量。**它是首页“待录入结果”卡片的优先单位，应明确显示检验项目/分析的数量，不能标成申请数或标本数。** 数量覆盖队列中仍可见的禁止录入行，不等价于当前可直接保存的项目数。
- `specimenCount`：身份完整时，按当前工作台的合法 `(sampleItemId, accessionNumber)` 分组口径统计。出现缺失或不可信标本身份时，建议返回 `null` 并置 `partial`，同时提供 `missingSpecimenAnalysisCount`；不能把按分析隔离出来的展示组冒充已确认标本。
- `displayRowCount`：当前队列实际呈现的结果行数，必须与组件展开、多选折叠、父子结果及旧 primary 规则一致，不能用分析数或活动组件数简单代替。发现重复行身份时不得静默去重后宣称摘要与工作台一致，因为工作台当前会拒绝该响应。
- `missingSpecimenAnalysisCount`：缺少合法标本身份的不同分析数。它用于说明资料完整性，不用来推断标本数量。
- `generatedAt`：本次摘要生成时间；不同请求间有新增、保存或审核操作时，不能承诺两个独立时点的数量永久相同。固定数据或同一读取快照下必须满足一致性测试。

### 状态与缺字段

- `ready` 仅用于三项计数都已精确、有效且与当前授权队列口径一致的响应。**`displayRowCount` 为 `null` 时不得返回 `ready`。**
- `partial` 只能表示已知不完整的中间结果；界面应清楚表示哪些数量暂不可用，不能把缺字段、无权限或请求失败显示为 `0`。
- 已确认的授权空队列返回三项 `0`、缺失数量 `0`，可为 `ready`。
- 缺少 RESULTS 权限继续由服务端拒绝；没有获准检验组且授权判断完整时，可以是授权空队列。
- 缺失合法分析身份、非法数量类型、负数或无法确认摘要完整性时，不得显示精确成功状态。
- 旧后端没有 `summary` 时，首页显示该结果摘要暂不可用；不得用旧全局 `ordersInProgress` 填补并标称同口径。
- 会话失效、身份切换和检验组上下文变化后，清空旧摘要；旧请求晚返回时不得覆盖新会话状态。
- **临时 `partial` 不能永久作为关闭 A-02 的依据。** 若精确展示行数或计数一致性仍未完成，必须在台账保留待实施/未通过项，完成合同或经明确记录的范围变更后才能验收。

## 最小且兼容的实施路线（待实施）

1. 保留 `/rest/results-entry/pending` 的 `testResult` 和 `total` 原语义，追加 `summary`。已有调用者可以继续使用旧字段。
2. 首页调用同一服务下的轻量 `/rest/results-entry/pending/summary`，仍使用 `@PreAuthorize("hasRole('RESULTS')")` 和请求会话身份。不得接受任意用户 ID 参数来查询他人的待办。
3. 抽取共用 pending 状态条件与授权范围。状态 ID 缺失、碰撞等配置异常沿用失败处理，不返回假空队列。
4. 把现有授权 Test ID 解析提取为可复用助手，使旧 `filterResultsByLabUnitRoles()` 与轻量摘要复用原授权逻辑。不能直接以 `Analysis.testSectionId` 自建旁路，因为原过滤依据为结果行的 Test ID，且权限包含登录上下文。
5. 分析数和标本数采用数据库聚合；展示行数采用轻量身份投影与共用行规则。摘要路径不能调用 `getPendingResultsForUser()` 或 `worklistLoader.load()` 再对完整结果列表计数，也不能为计数加载患者、备注、字典、签名和结果值。
6. 如果精确展示行规则本批尚未实现，可暂用 `displayRowCount: null`、`state: "partial"` 明示现状；这只是中间交付，不能标记 A-02 完成。
7. 工作台与首页都使用明确数量单位。首页现有跨类型待办求和不具备统一的标本/申请含义，不能把混合数量当成去重工作量；至少避免结果项目数被误标为申请数或标本数。

不得擅自修改保存、签名、审核、标本禁止录入规则，或为了对齐计数而隐藏当前队列中的警告行。

## 推荐实施文件

以下为建议范围，尚未创建新增文件或修改既有实现：

- `src/main/java/org/openelisglobal/result/service/ResultEntryWorklistService.java`
- `src/main/java/org/openelisglobal/result/service/ResultEntryWorklistServiceImpl.java`
- `src/main/java/org/openelisglobal/result/controller/rest/ResultEntryRestController.java`
- 结果模块新增 `PendingResultSummary` DTO 与轻量聚合/投影查询 DAO；具体目录和命名应遵循现有仓库约定。
- `src/main/java/org/openelisglobal/systemuser/service/UserService.java`
- `src/main/java/org/openelisglobal/systemuser/service/UserServiceImpl.java`：仅提取并复用既有授权范围，不重定义角色规则。
- `src/main/java/org/openelisglobal/result/action/util/ResultsLoadUtility.java`：仅在实现精确展示行摘要时抽取共用行身份/展开规则，避免另外复制一套逐渐偏离的算法。
- `frontend/src/components/home/Dashboard.tsx`、摘要请求/类型模块、对应国际化文案。
- `frontend/src/components/resultPage/unified/UnifiedResults.tsx`：对齐摘要与数量单位，保留旧列表响应兼容和会话保护。

## 必须测试与完成证据

现有 `src/test/java/org/openelisglobal/result/service/ResultEntryWorklistServiceTest.java` 已覆盖部分队列状态与授权调用，但不足以证明新摘要合同。以下测试均待实施和实际运行：

1. **状态一致性**：未开始与审核退回入队；已发布、已打印分析不入队；状态 ID 缺失/碰撞不返回假零。
2. **权限一致性**：RESULTS 角色、无 RESULTS、指定检验组、全部检验组、登录限制检验组；摘要与实际列表看到相同范围，不泄露其他检验组计数。
3. **数量一致性**：一管多个分析、一个分析多个组件、未录组件补空、多选折叠、父子结果、旧 primary、重复行身份。使用固定数据比较摘要和授权列表的实际行/分析/标本分组结果。
4. **缺失与异常**：标本 ID 缺失、非法 Analysis ID、摘要缺字段、非法数量、网络错误；不能显示假零、假 `ready` 或上一用户数量。
5. **并发会话**：身份切换、会话失效、检验组切换与旧请求晚到，不能恢复旧摘要。
6. **性能边界**：摘要路径验证不调用完整 worklist loader，不读取患者、备注、字典或完整结果值；用大队列测试证明数据库聚合或有界内存处理。
7. **兼容性**：原 `testResult` 和 `total` 不变，既有结果工作台加载/保存/签名/警告回归通过；禁止录入行仍保留。
8. **端到端验收**：实际运行首页结果卡片后进入 `/Results?scope=pending`，核对明确单位与同一授权口径；记录数据快照/操作时间，不把跨时点变化误判为静态一致。

A-02 关闭前须记录实施源提交、测试命令与结果、运行版本、实际页面证据及仍存在的外部验收限制；缺少证据不得标完成。
