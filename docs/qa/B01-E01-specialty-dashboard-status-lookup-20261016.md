# B-01／E-01：专科病例查找使用已查回状态

状态：已集成，局部组件验证通过；未部署，完整新鲜矩阵待执行。专科产品筛选和业务规则不改。

## 实际失败

a15 原完整349在免疫组化 Change The Status of Order and saves it 失败，实际200通过、1失败、148未执行。原14个专科场景不变。第3次 exactCreatedSpecialtyOrder 返回200 JSON数组，但同实验室编号匹配为0；截图状态筛选为 IN_PROGRESS、进行中0、待审1。

此前新建申请、签收与验收、技师认领以及保存 READY_PATHOLOGIST 已执行成功，助手已通过同病例GET独立查回状态；未进入随后病理医师认领及签发。成功写入不得重放。

根任务同运行只读查回确认：病例3为 READY_PATHOLOGIST、技师1；IN_PROGRESS查询0项，READY_PATHOLOGIST查询1项；病例、原申请与单管身份一致，业务POST为0。证据保存在外部诊断目录 actual-readback/verification.json，原请求及对象内容仅保留在私有证据。

## 可证伪假设与结果

1. 返回默认筛选排除已保存的待审状态：若成立，切换既有 READY_PATHOLOGIST 选项后相同编号应查到同病例。真实查回及实际组件反馈均支持。
2. 编号或病例ID映射不一致：若成立，两种状态查询都不能得到同身份。真实READY结果及同病例GET排除；匹配字段仍为 labNumber / immunohistochemistrySampleId。
3. READY保存未持久化：若成立，同病例GET不应为READY。原保存后的独立GET与根只读查回排除。
4. 权限过滤隐藏病例：若成立，同账号READY查询也不应返回该病例。根同会话状态查询排除。

## 最小改动

CurrentSpecialtyDashboard.saveCase在原独立GET的状态断言通过后，用该已确认状态更新既有dashboardStatus。findExactOrder在状态已知时选择真实statusFilter选项，同时限定及断言请求statuses；继续按原labNumber筛选、要求唯一行及同caseId。首次尚无状态时保持原查找。未改为All，未放宽身份或行数，未增加重试、预算或保存次数。

病理默认“进行中”包含非完成状态，免疫组化默认只含IN_PROGRESS；不修改产品筛选去迁就测试。三个专科共用同助手，选择的是对应服务已返回的具体状态。

## 局部验证

外部临时载体直接渲染PAT的真实ImmunohistochemistryDashboard及Carbon下拉，API仅按既有状态和编号契约提供明确合成数据。它验证真实组件发出的查询和行显示，并核0保存调用，不冒称真实Cypress执行。

- 原操作（返回默认IN_PROGRESS后直接搜索）：1通过、1失败，失败同症状为[]长度0。
- 选择已查回READY后搜索：同2项全部通过；同编号、同caseId、精确statuses与0保存检查通过。
- 另1项保留IN_PROGRESS正确排除READY的语义。
- 初次诊断因外部目录未链接离线依赖而无法导入，属于载体准备失败，不计产品红；原日志保留。
- 原dashboard.cy.js的14项、全部原身份断言和预算保持；候选助手格式检查通过。

重现命令在冻结PAT/frontend运行，D为外部a15-specialty-case-lookup-diagnosis目录：

```sh
node node_modules/vitest/vitest.mjs run --config "$D/vitest.config.mts" --reporter=verbose
DIAG_SELECT_READBACK_STATUS=1 node node_modules/vitest/vitest.mjs run --config "$D/vitest.config.mts" --reporter=verbose
```

完整真实验证仍须在下一新鲜隔离矩阵执行原349（含原14专科场景），以及原主335＋关闭3与补验。不得重跑a15已成功保存的专科申请，不以临时组件绿代替真实签发及完整发布通过。
