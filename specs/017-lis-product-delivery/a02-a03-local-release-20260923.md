# A-02/A-03 本地部署与未通过门禁（2026-09-23）

本批已形成可查看的本地改造版，但完整浏览器门禁未通过，**没有推送远程，也没有关闭 A—E 的任何整项**。本记录是交付状态，不是验收豁免。

## 源码与运行版

- 业务源码提交：`5448226d354993e54b3f730d1a84272a9fdee68c`，95文件，范围为A-02审核待办/只读会话、A-03共同受限说明及关联核查。
- 主集成树：`/private/tmp/lis-active-20260923/delivery-worktree`；已快进同步的长期代码仓：`/Users/ld/Projects/openelis-cn-delivery`。原Documents仓不覆盖。
- 分支：`feat/017-lis-product-delivery-m1-report-foundation`；远程最后核实仍为`3e1e3b402fc549236c28446cc53cd652c913385b`。随后的本地文档提交不改变该业务产物，运行版本仍指向5448226d35。
- 入口：`http://127.0.0.1:18080/`。2026-09-23 22:57:05仅替换frontend；候选后端22:18已健康。数据库和代理未重建。
- 前端容器：`884bc303faba7468798374c04ef4721f4d38f3646548ebe2d9378b28a6f6dca3`；镜像：`sha256:f8d99ca717ce9c54870f21315648a6d5cea8063bd26de7a066735d4f4b0eea1c`；0.5 CPU、256MiB限额保留。
- 后端镜像：`sha256:cc1e3a62703eee5b045d2200fa61e3e85264fc5a4d2cf0f2716ae118948a7758`；WAR SHA256 `66def8a85693b31addfd6dcd863b38d11e5774c31070c4bd3dcb1ce9706204b7`，与121项已测产物相同。
- 前端输入指纹：`95bea84f80d7f11d9e41c819f56843418cc75fb3e3a94821e829929e7778a956`。1314输入保持冻结，208构建文件经真实18080逐字节核对；第209文件为如实标记E2E受阻的`delivery-version.json`。
- 六个SPA入口使用同一index且no-cache；缺失资产404；运行Nginx与源码一致。三个非前端容器ID未变，清理后只运行四个核心服务。

## 正式入口实际点击与截图

已从18080重新加载并登录验证，页面脚本为`index-CJMtqZCr.js`，样式为`index-DwHaMcvU.css`。

1. 首页读取25项待录入、2项待审核；一次点击审核自动加载2项任务、2个受理号组、2行、0项QC受阻。
2. 返回首页，再一次点击结果加载25行/8个标本记录。行内“受限说明”选中对应18项标本并把焦点定位到`result-specimen-block-0-0`。
3. 1280×720、scrollY=0时选中态首行底部719.4px，说明区集中显示真实验收依据变化原因。原有拦截保留，没有修改历史标本状态来开放输入。
4. 截图：`a02-formal-dashboard-after.png`、`a02-formal-review-after.png`、`a03-formal-results-all-after.png`、`a03-formal-results-selected-after.png`。viewport验证后已恢复默认。
5. 本次实页未提交结果、审核、签发、打印等业务写操作；移动宽度及多标签读取的候选测试与同一冻结产物对应，不能外推为全部写态验收。

实际截图和JSON保存在长期证据目录 `/Users/ld/Projects/openelis-cn-delivery-evidence/20260923/a02-a03-integration`。候选18082代理已停止；隔离Cypress的18084代理、2容器/卷/网络及临时dump/凭据已清理。

## 测试结果与未完成门禁

- 后端：15类121项定向通过；独立临时数据库自动删除；不宣称完整后端全量或医院业务全链。
- 前端：全套首次3850通过/8失败/13原跳过，两个未改失败文件原样42/42复测通过；综合3858项获得通过证据，首次全套失败仍保留。类型基线401历史诊断无新增、1896字典引用、46变更文件格式检查和生产构建通过。
- 实际只读队列：结果25/8、审核2/2，对比替换前后Analysis ID集合一致；未查询/真实零、授权、非法范围/分页已验证。
- **完整Cypress未通过**：原34spec全选，exit1，首个空凭据登录用例3秒内找不到英文错误提示。隔离诊断确认401拒绝，响应观测7381ms，未可靠捕获中文错误toast。旧语言断言、异步等待及通知显示必须分别核查，不能仅扩大timeout或删除断言。
- 原后续spec因fail-fast停止；其reporting pass不代表业务通过。详细事实见隔离门禁记录。原始配置hash的false来自Mounts数组顺序，已保留并以原hash复原及全字段比较补证静态配置未变，不替换基线。

仓库 `AGENTS.md` 的pre-push要求明确为“Only push if full suite passes”，constitution V.5也要求完整fail-fast。本批没有满足该门禁，故本地提交和本地候选部署与远程发布分开记录，**未自行降低或跳过门禁**。

## 回退与唯一下一步

前端回退：将`openelis-cn-frontend:before-a02-review-20260923`重新标记为`:local`，使用现有compose只重建frontend.openelis.org，并核对版本/页面。旧前端dist保留在长期证据目录的`frontend-dist-before-5448226d35`。

后端回退：使用私有`a02-review-runtime-backup/rollback-image.override.json`与原`webapp.compose.json`，仅重建oe.openelis.org。回退镜像`openelis-cn-webapp:before-a02-review-20260923`；不能直接沿用旧compose里不存在的`:a02-candidate`标签。私有配置不进入Git。

**唯一下一步：修复当前发布所依赖的旧端到端验收合同，先闭环登录响应/错误提示和当前中文定位，再维护首页待办入口；在隔离数据中逐项处理后续真实失败并重新执行完整门禁，通过后推送本批实际分支并读回远程提交。** 不批量跳过后续spec，不把本轮失败自动设为允许基线；若用户另行明确批准限定豁免，须新增变更记录。

该工作归原E-01每批验证，不增减14项范围。随后仍按已冻结A—E顺序继续A-01写态会话、A-03对象交接及B/C工作区；B-01/C-01查询合同目前仍是提案。报告/打印等其余待办也未因本批自动完成。医院真实HIS、仪器、岗位制度与真实用户验收继续单独待验。
