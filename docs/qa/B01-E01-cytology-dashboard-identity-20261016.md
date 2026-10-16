# B-01／E-01：细胞学列表病例身份字段

状态：已集成；局部助手反馈通过，待完整发布验收。未重放 a17 已保存申请，完整新鲜矩阵尚未通过。

## 实际失败与契约

a17 原完整349在细胞学“User navigates back to Cytology Dashboard to confirm added order”失败，助手 line163 将病例身份读为 undefined。病理与免疫组化9项、细胞学新建及打印按钮检查2项此前已通过。不能将后续诊断拼成原349通过。

细胞学列表 DTO CytologyDisplayItem 的既有字段为 pathologySampleId；CytologyDisplayServiceImpl 将当前 CytologySample.id 写入该字段，实际 CytologyDashBoard 同样使用该字段建立行身份。技师和细胞病理医师认领接口的请求参数则为 cytologySampleId。二者名称不同，指向同一细胞学病例。

根任务对同 a17 的一次只读查回确认：列表唯一行、病例详情与已保存申请身份一致，状态 PREPARING_SLIDES；pathologySampleId 存在，cytologySampleId 缺失；业务写入0。原响应0600留存在外部 a17-cytology-readback/actual，不将患者信息写入本记录。

## 可证伪假设与结论

1. 助手混用列表返回字段和认领请求参数：真实返回及离线回放支持。仅区分两种字段后，同一响应通过原严格身份断言。
2. 产品未返回病例身份：DTO、显示服务、实际列表及详情都存在 pathologySampleId，排除。
3. 列表匹配了错误申请或重复病例：根任务同申请查回及原唯一 labNumber 匹配支持排除；此断言保持不变。

## 最小修复

三个专科定义显式 dashboardIdKey；细胞学为 pathologySampleId，其余与原列表契约一致。仅 findExactOrder 和完成列表查回两处使用 dashboardIdKey。sampleKey 及两处认领 POST URL 仍保持原参数。没有使用候补字段、任意首行或吞掉缺失ID。原正整数ID、唯一编号、同caseId、状态和请求身份检查不变。产品、原14个场景、预算、重试、保存次数不改。

## 已执行的局部反馈

外部 identity-feedback.node-test.mjs 直接加载真实助手全文，仅替换模块导入/导出以提供 Cypress 调用边界，使用已有 Chai 执行原助手断言。列表输入包括同 a17 已留存真实响应的必要字段；不发HTTP，不启动业务浏览器，不调用保存。该载体验证助手字段选择，不能代表真实 Cypress 调度、页面点击或持久化验收。

- 最终同10项：原助手6通过4失败；候选10通过0失败。首个失败与原 line163 的 undefined 完全一致。
- 覆盖首查与完成查回、病理/免疫原契约、缺失ID、错病例、重复编号、不同编号、真实响应回放及认领参数保持。
- 原 dashboard.cy.js 14项逐字不变；候选反向移除3个定义并还原2处读取后与原助手逐字相同；格式检查通过。
- 初次误用 Node --test 将源码参数作为测试文件，属于载体调用准备错误，原日志保留，不计助手红。

复现命令：`node identity-feedback.node-test.mjs /绝对路径/CurrentSpecialtyDashboard.js`。baseline-final.log 与 candidate-final.log 是最终同载体红绿记录。下一步由根任务独审、集成后，在新鲜完整349及主335＋关闭3和既有补验中验收。
