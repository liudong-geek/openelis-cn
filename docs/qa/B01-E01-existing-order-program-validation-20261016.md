# B-01 / E-01：已有申请业务类型校验

## 问题与改动

a16 原修改申请第 14 场景的保存返回 400。根单次只读查询确认，原申请和编辑表单均返回 `program=Cytology`，并具备修改权限。创建流程可将现代 Program 的名称以 LITERAL 写入 PROGRAM，旧字典流程使用数字 ID；编辑 GET 原样读取该历史值，并用名称查找独立 ProgramSample 身份。原编辑 Bean Validation 对这两种历史表示都使用数字约束，拒绝合法名称。

本次仅将 `SampleOrderItem.program` 的校验组分开：新增及批量新增保留数字 ID 约束；编辑允许已有名称和数字值，并用局部 `[^<>]*` 拒绝标签字符，包括换行标签。`programId`、读回映射、原权限、日期规则、服务事务和 Observation 更新逻辑均不改。前端原样保留已有 program 和 programId。

## 实际验证

- 原 28 项 MVC 测试保持，新增 4 项：英文名称及独立 ID、中文名称、数字与 Entry/Batch 原约束、含换行的标签拒绝。相同测试在旧源码 30 通过 / 2 失败；候选 32 通过。
- 本轮实际完整编辑 GET 经原 `buildSampleEditPayload` 构造未修改表单，真实 Jackson/FHIR 解析、Bean Validation、自定义表单 Validator 与 MVC：旧版唯一字段错误 `sampleOrderItems.program:Pattern`，自定义错误为空，返回 400；候选全部字段有效，返回 200。载体包含原 28 项，共旧 28 通过 / 1 失败，新 29 通过。
- 实际 `SampleOrderService.createOrUpdateObservation` 的独立临时载体 4 项通过：已有英文/中文 LITERAL 与旧 DICTIONARY 的值、类型、Observation/申请/患者身份保持，原新建字典路径仍为 DICTIONARY。使用服务依赖 mock，无数据库写入；不冒称真实持久化。
- 完整表单为本轮 GET 派生，不是原失败 POST 抓包；原 400 响应正文未被原 Cypress 保存。初始临时载体的 FHIR bean、Mockito 配置初始化和测试构造参数错误保留在外部日志，不计作产品红测。
- 原修改申请 19 场景、结果精确两项及其余原验收断言、数据、预算均不改；实际成功保存仍由新鲜完整矩阵验证，不重放 a16 业务保存。

私有实际 GET 和派生表单仅保留在工作区受限证据目录，不进入仓库。中文手册操作流程无变化。候选未经新鲜完整矩阵与部署核验，不标交付完成。
