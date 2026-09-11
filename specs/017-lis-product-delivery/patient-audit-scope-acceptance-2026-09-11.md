# 患者操作日志联动：限定回归与版本检查点

日期：2026-09-11。依据交付计划 v3 的 M0-02/M0-03 及固定遗留收口包。

本批补执行此前因依赖占位而未运行的患者日志回归，整理已有实现，不新增存放或历史页面。只验证前端交互和请求合同，不关闭后端读取范围、备注审计、报告 P0 或整体交付验收。

## 已验证的产品行为

- 进入“患者档案”日志后，未选择患者时不能查询或导出患者日志。
- 选中患者后，列表、分页和两种导出都使用该患者 ID，明确请求 `PATIENT,PERSON`，包括姓名等人员信息变更。
- 清除患者或切换业务对象，立即清空旧记录、总数与分页；不能沿用上一个患者条件导出。
- 切换患者或业务对象后，迟到的旧查询和旧患者详情不能覆盖当前选择或结果。

## 本次实际执行结果

使用恢复后的原项目依赖和既有 Vite/Vitest 配置，没有替换包版本、隔离映射依赖或修改测试超时。

| 范围 | 结果 | 边界 |
| --- | --- | --- |
| `SystemAuditEvents.patientScope.test.jsx` | 6/6 通过 | 真实 Carbon 与患者查询组件；服务响应模拟，未访问业务库 |
| `SystemAuditEvents.test.jsx` | 2/2 通过 | 原日期/API 格式及中文列表、分页兼容；部分控件模拟 |
| `auditLocalization.test.js` | 11/11 通过 | 本地化映射单元，不是页面或医疗业务验收 |

合计 19/19、0 失败、0 跳过，3 个测试文件；12:13:39 开始，Vitest 总耗时 12.78 秒。原 09-10 的 0 执行/运行器失败证据不删除、不改为通过。

命令：在 `frontend` 执行 `npm run test:unit -- src/components/reports/auditTrailReport/SystemAuditEvents.patientScope.test.jsx src/components/reports/auditTrailReport/SystemAuditEvents.test.jsx src/components/reports/auditTrailReport/auditLocalization.test.js --reporter=default --reporter=json --outputFile=../tmp/m0-frontend-recovery-20260911/frontend-tests-01.json`。

结果：[原始 JSON](../../tmp/m0-frontend-recovery-20260911/frontend-tests-01.json)，SHA-256：`9a88a98bd918fa3b571b1a1bdca36a1cdb9ba71c51deb8ebb90ce38dd2f74c48`。

本次保留一项控制台兼容警告：真实患者查询中的 `CustomDatePicker` 给 Carbon 传入的 `maxDate` 不符合其声明的 string/number 类型。测试没有因此失败，也没有屏蔽告警；日期控件的真实浏览器行为另归 M3 复核，本批不扩展修改。

## 源码、审查及保存边界

- 组件 SHA-256：`892096a6aa9b22e3c840a37846358100e81fb316b563e6286e11513e7ff04855`。
- 新增 6 项测试文件 SHA-256：`6a84cd2a52ec6681362689b21dc1c128df3da35fb28e5f219988945e5a8e9ba0`。
- 两者与 09-10 冻结候选一致；本次没有重写业务实现。
- 恢复后验 `verify-02` 与测试后 `verify-03`：15,595 份恢复文件全部本地、原 inode/尺寸/mtime 稳定，前后 SHA-256 全部一致；7,702 份受保护输入测试前后稳定。
- 项目原 Prettier 3.8.3 对两份待提交前端文件实际执行定向格式化和检查通过，两份均显示 unchanged。首次默认检查受 `.prettierignore` 中 `reports/` 影响而跳过，不能算通过；通过 `--file-info` 识别后，对这两份精确源码加 `--ignore-path /dev/null` 重新实际执行，保留原项目样式配置。未修改全局忽略规则，也没有全树格式化或改动其他未提交代码。该忽略范围问题归 M0-03 全量格式门禁复核。
- 独立差量审查通过：HEAD 后端原已支持逗号类型列表和患者/关联人员联合读取；本批无新增业务导入或消息 ID，所用上下文、服务和中文消息合同已在 HEAD，不需夹带其他共享文件修改。此静态兼容判断不代替真实前后端联调。
- 版本检查点只包含上述组件、配套 6 项测试和本记录；原 2 项/11 项兼容测试已在仓库，不重复加入。提交号以唯一执行台账为准。

## 尚未完成

没有验证真实后端、完整认证链、数据库、浏览器视觉、多岗位或全部前端构建。后台更严格的日志范围保护仍须原收口包独立验证和提交；前端按钮限制不能替代后端权限。单独前端检查点不意味着允许前后端分开发版。

未启动 Docker、改动任何患者记录、导出真实文件、签发报告或部署 HTTP 运行版；完整候选门禁、授权备份和固定回退版本齐备后才可替换运行版。后续仍按 v3 先收口已有修改和环境，再继续 M1 报告安全主批。
