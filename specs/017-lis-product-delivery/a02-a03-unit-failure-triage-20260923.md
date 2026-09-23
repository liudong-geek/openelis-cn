# A-02 / A-03 全量失败核查及原样复测

2026-09-23；主集成树 `/private/tmp/lis-active-20260923/delivery-worktree`。本核查未修改任何产品、测试、门禁或超时配置，未提交、推送或部署。

## 结论

全量原始结果为 **302 文件中 300 通过、2 失败；3850 用例通过、8 失败、13 跳过；2049.67 秒**。失败的两个完整文件随后在同一冻结代码、同一默认沙箱和单 worker 下原样复跑，**2 文件 / 42 用例全部通过，退出码 0，耗时 89.29 秒**。

这提供了原失败用例的通过证据，但不把原始全量运行改写成一次全绿。按固定用例身份合并两次结果，本候选的 3858 个非跳过用例均获得通过证据；13 个原跳过用例仍为跳过。无需修改源码或放宽阈值来使本次复测通过。

## 8 个最终错误

1. `TypeScriptBaseline.test.js`：成功退出的未知输出不能算完成检查。
2. 同文件：已有诊断后的未知输出不能忽略。
3. 同文件：原文件诊断数增加仍由原基线比较拒绝。
4. 同文件：实际安装的 TypeScript 检查隔离 SIM 工程 clean。
5. 同文件：隔离 SIM 工程 type-error。
6. 同文件：隔离 SIM 工程 global-error。

上述 6 项均在 `runGate` 第 91 行因 `spawnSync /usr/local/Cellar/node/25.6.1_1/bin/node ETIMEDOUT` 失败，`errno=-60`；测试自身对子进程的原始 5000 ms 上限未改。不是门禁错误地放行诊断的断言，也不是 EPERM。该文件测试的是复制到独立 SIM 目录的门禁脚本和编译器替身/小型真实 TypeScript 工程，不加载本批首页、结果或审核业务代码。

7. `SystemAuditEvents.patientScope.test.jsx`：“实际选择患者后列表、翻页、表格和文档均请求患者与人员两类记录”达到现有全局 15000 ms 上限，测试入口第 183 行。
8. 同文件紧随其后的“切换非患者类型清空旧日志及患者条件，返回患者入口需要重新选择”，在第 224 行调用 `choosePatient`，第 100 行找不到“选择患者 / 选择其他患者”按钮。这个是查询断言失败，不应表述为第二个超时。

第 8 项的顺序及首例尚未结束的异步操作使超时后串扰成为合理解释，但未做故障注入证明，不能当作已证实根因。完整 6 项患者日志测试原样复跑通过，且原全量后续 3 项涉及异步患者/范围保护的测试通过；未发现本批可定位的产品回归。

## 变更关联与边界

已核对以下文件相对 HEAD 未变：TypeScriptBaseline 测试及门禁脚本、SystemAuditEvents 及其测试、SearchPatientForm、Utils、CustomDatePicker、日期工具、Style.css、setupTests、vite.config。唯一共用变化是中文资源增加首页/结果/审核键并调整两个 results.queue 键，不涉及患者日志测试使用的键。

真实患者联合实体查询、分页、导出、清空和过期响应防护的断言均保留；本次没有跳过失败场景，没有增加 timeout，没有降低门禁要求。能够确认发生过进程及测试超时，不能进一步断定是沙箱或 CPU 导致；原样复测仍使用 `use_default`，因此“必须脱离沙箱才能通过”没有依据。

## 原样复测记录

工作目录：`/private/tmp/lis-active-20260923/delivery-worktree/frontend`

```text
./node_modules/.bin/vitest run --maxWorkers=1 src/TypeScriptBaseline.test.js src/components/reports/auditTrailReport/SystemAuditEvents.patientScope.test.jsx
```

开始时间 22:38:56。日志 `a02-a03-unit-failures-rerun.log`；2 文件、42 用例通过。开始前和结束后均对 `a02-a03-final-frontend-inputs.json` 中 1314 个前端输入文件逐一校验 SHA-256，0 差异。证据：`a02-a03-unit-rerun-source-before.json`、`a02-a03-unit-rerun-source-after.json`；后者含复测命令、日志摘要和退出码。

原始完整日志 `a02-a03-final-full-unit.log` 保留。历史 `a03-combined-full-unit.log` 曾有 295 文件 / 3712 通过 / 13 跳过（1114.18 秒），只作为历史参照，不能替代本候选验证。历史日志未记录执行权限，不推断旧轮沙箱模式。
