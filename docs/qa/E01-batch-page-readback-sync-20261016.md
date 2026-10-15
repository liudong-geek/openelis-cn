# E-01 批量按需保存：页面查回与助手同步（2026-10-16）

## 状态和边界

变更编号：CHG-130。助手已集成隔离候选，尚未执行新版浏览器验收。来源是 a13 冻结提交 `fde5b02624e2ec8d7cea413abbd201d508bd2bf8` 的 `targeted-remaining199/cypress/pages/BatchOrderEntryPage.js`；与该提交的 Git 源码逐字节相同。产品保存逻辑、原14场景标题及输入、夹具、配置预算、POST次数和独立查回全身份断言不变。

实际运行 a13 原批量14项：5通过、1失败、8未执行。第6项 `Generate BarCode` 已收到业务 POST HTTP 200，禁止重放该保存。前5项仅填写的事实不能扩展成第6项未写入。

## 原始证据

- 运行日志：`release-runtime/runs/a13/targeted-remaining199.log`。
- 原结果：`release-runtime/runs/a13/targeted-remaining199-results/native-result.json`。
- 截图：`release-runtime/runs/a13/targeted-remaining199/cypress/screenshots/batchOrderEntry.cy.js/Batch Order Entry On Demand and Serum form type -- Generate BarCode (failed).png`。
- 被动网络：`network-error-a13-diagnosis/segment-103/passive-events.jsonl`；请求链的无堆栈摘录及原文件SHA记录在本候选目录的 `network-sequence.json`、`verification.json`。

以上路径均相对 `/Users/ld/Documents/lismyself/outputs/lis-six-batch-20261013`。

| 事件                | requestId | CDP协议时间对应UTC       | 事实                                      |
| ------------------- | --------- | ------------------------ | ----------------------------------------- |
| 生成申请号 GET 发出 | 76307.302 | 2026-10-15 18:14:30.995  | 实际页面请求                              |
| 生成申请号 GET 完成 | 76307.302 | 18:14:31.111             | HTTP 200                                  |
| 批量保存 POST 发出  | 76307.303 | 18:14:31.185             | 实际业务提交                              |
| 批量保存 POST 响应  | 76307.303 | 18:14:33.768             | HTTP 200，约2.583秒                       |
| 页面查回 GET 发出   | 76307.304 | 18:14:33.772             | queryVersion、labNumber 两查询键          |
| 原批量 spec 结束    | —         | 18:14:34.487             | DOM启用断言3秒超时，5通过／1失败／8未执行 |
| 被动观察结束        | —         | 18:14:34.681（观察时间） | existing-target-closed                    |

requestId `76307.304` 在该段392条记录内只有发出事件，没有响应、完成或失败事件。不能据此声称 GET 已成功、已取消，或已独立核实持久化成功。原结果仅保存 spec 结束时间，没有按钮断言精确失败时刻；查回发出到 spec 结束最多715毫秒，不将该上界说成请求完整耗时。

截图申请号经原始完整URL SHA离线确认是 `DEV01260000000000005`（20字符）。完整URL为 `https://127.0.0.1:19476/api/OpenELIS-Global/rest/order/saved?queryVersion=2&labNumber=DEV01260000000000005`，SHA256为 `a31a7099b0636b994c0e92504920c9cfe597ef01c633dca0b7bec2b6e92307c1`，与seq376相同；19和21字符候选均不相同。观察器对原URL取SHA，未记录查询值或正文，核对未访问服务。

## 定位与最小变更

原助手 `clickGenerateAndSaveBarcode()` 仅等待编号生成GET，紧接着 `checkNextLabel()` 进行3000毫秒DOM启用断言，随后才到 `assertSavedOrder()` 的POST及独立GET完整校验。实际产品必须先保存，再完成页面自己的 `/order/saved` 身份核对，才允许下一标签。因此旧助手把完整保存／查回网络链路错误地放进DOM等待窗口。

候选仅修改 `watchClinicalSaves()` 和 `checkNextLabel()`：

1. 保存前注册实际页面 GET 的观察别名 `batchPageSavedOrder`，不桩替响应，不发额外请求。
2. 检查下一标签前等待该真实页面GET完成，核对请求及响应的queryVersion、申请号和JSON HTTP 200，再按原3000毫秒DOM重试确认按钮启用。没有固定延时或新增超时参数，沿用原网络等待配置。
3. 后续原 `assertSavedOrder()` 整段逐字节保持：仍单独等待真实POST，验证完整载荷，再用原独立GET核对患者、申请、标本、检验项目、机构科室、日期及写入次数。新的等待不消耗POST别名。

即使页面GET返回200但业务身份不一致，产品仍不启用按钮，原启用断言会失败；独立GET与完整身份检查亦没有被替代。缺少GET、返回错误或非JSON也会失败，不将等待完成等同业务成功。

## 已做验证与待完成

已完成离线源码绑定、原14项与输入/配置未变核对、仅两助手方法变化核对；JavaScript语法检查退出0，候选补丁在当前PAT `4c98a60917ef1bf87c3243bab7b593af473fa76e` 仅作 `git apply --check` 退出0。未改PAT，也未构建、调用HTTP或执行任何业务写入。上述静态结果不是真实浏览器通过。

下一次验证采用根冻结新候选后的全新隔离完整349矩阵，原批量14场景自然执行一次，并同时核对按需及预印的保存、全身份独立查回、完成后的设置复位和取消零提交。a13第6项既已POST200，不在a13重放；如需确认原保存状态，仅由根安排现有ActorAPI独立GET。保留本次失败、数据卷与被动记录，不以局部检查拼接成完整验收通过。

## 保存状态补充核对

根任务通过现有 ActorAPI 单次认证并只读查询相同申请号，HTTP 200 回执确认申请9200204、1根标本管、1条采集请求及10项检验任务，前后隔离运行身份相同，业务写入0次。原始回执与字段校验在 `batch-a13-saved-readback/actual-readback/`。该结果确认实际已保存，不替代原POST完整载荷一致性或页面交互验收；不得重放本次保存。
