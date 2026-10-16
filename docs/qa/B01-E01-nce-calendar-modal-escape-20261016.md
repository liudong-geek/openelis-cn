# B-01 / E-01：不符合项登记日历的 Escape 关闭层级

## 范围与状态

根已集成，尚未部署。仅修改不符合项登记弹窗与其中的事件日期控件，复用现有 Carbon DatePicker 的公开 `ref.calendar`，不改共享日期组件、Carbon 源码、其他弹窗或业务权限。原 NCE Cypress 场景、输入、保存次数、超时预算与断言均不变。

## 现场失败

a15 `targeted-remaining114-readiness` 的 `nonConform.cy.js` 第 3 项在输入日期后执行 Escape，再执行 blur 时失败。截图显示登记弹窗上方出现“放弃当前草稿？”，焦点已转到“继续填写”。本次诊断没有重新打开业务浏览器、认证、HTTP 或业务保存。

## 假设与实际反馈

| 假设                                                   | 实际证据                                                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入完整日期已关闭日历，助手无条件 Escape 正常关闭表单 | 真实 Modal + Report + Carbon + Flatpickr 组件测试在 Escape 前记录 `isOpen=true`、日历含 `open` 类、焦点仍在日期输入框，排除此复现中的假设。                                               |
| 外层 Modal 抢先处理 Escape，内层日历没有机会关闭       | Carbon ComposedModal 在 document 捕获阶段处理 Escape，调用 preventDefault / stopPropagation 后调用 onClose；Flatpickr 在输入框 / 日历上监听。真实原组件红测出现放弃草稿确认，支持此原因。 |
| blur 或业务请求失败导致确认框出现                      | 同步 Escape 后、尚未 blur 时已出现确认框；新增场景业务 POST 为 0。                                                                                                                        |
| 日历已关闭时表单本身的 Escape 保护错误                 | 该对照场景原组件已通过，继续保留原草稿确认行为。                                                                                                                                          |

原日历测试只渲染独立 Report 表单，未包括外层 NceRegistrationModal。新增测试使用实际 Modal，不以测试替身模拟其关闭行为。

## 修复

NceRegistrationModal 持有仅属于本弹窗事件日期控件的 ref，Report 将该 ref 传给 Carbon DatePicker。仅在当前顶层是登记弹窗、事件为 Escape 且该日历实际打开时，先将焦点放回该日期输入，再关闭日历，返回 false 保持表单打开。

焦点恢复先于日历关闭，避免关闭后再次聚焦重新打开日历。没有用全局第一个 `.open` 查找日历，也没有读取或改写其他页面的日期控件。

日历已关闭后的下一次 Escape、右上角关闭按钮和取消按钮继续经过原有草稿 / 保存中 / 未确认回执保护。现有中文月份 onOpen 逻辑保持不变。

## 已执行验证

- 外部 `baseline.log`：实际 Modal / Carbon / Flatpickr，新增 2 项中 1 通过 / 1 失败；原日历 11 项未执行。失败前明确记录日历打开且输入有焦点，不能将其表述为仅观察最终确认框。
- `candidate-first.log`：同 2 项通过。
- `candidate-full.log`：原 `NceCalendar.locale.test.jsx` 11 项完整保留，仅增加一个 import 和末尾 4 项；实际日历测试 15 项全部通过，0 跳过。
- 新增 4 项覆盖：打开日历时第一次 Escape 仅关闭日历；随后第二次 Escape 的草稿确认；日历已关闭时的 Escape；日历打开时点击关闭按钮或取消按钮。新增场景日期值保留且业务 POST 为 0。
- `workspace-original.log`：原 `NceWorkspace.test.jsx` 46 项全部通过，0 跳过；包括原草稿、保存中及未知回执保护。该套沿用现有普通单测日历替身；真实日历证据是上一套 15 项。
- 根实际仓原真实日历入口：两文件 23 项全部通过（登记 15 + 纠正措施 8），记录 `root-calendar.log`；原工作区 46 项结果仍单独保存。
- `prettier.log`：3 份产品 / 测试候选格式化完成。最终绑定见外部 final-manifest.json。

这些是实际 React / Carbon / Flatpickr 在 JSDOM 下的组件验证，不是运行中浏览器的几何点击或完整医院流程验收。下一份新鲜隔离运行环境仍须执行原完整 NCE 场景；不能重放此前已保存的其他业务记录。
