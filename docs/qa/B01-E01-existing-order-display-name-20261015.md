# B-01 / E-01 已有申请只读姓名校验

记录日期：2026-10-16。需求关联：B-01、E-01；变更关联：CHG-125。

## 现象与修复边界

a12 冻结版本 132055ce4 的原修改申请场景在 POST `/rest/SampleEdit` 返回 400。原失败响应正文未捕获，不能将后续局部结果称为原响应的完整还原。

随后已取得的只读 GET 中 `patientName` 为 `Smith, John`。该字段由服务端 `getLastFirstName` 生成，修改页仅显示，保存时随 DTO 原样提交，修改服务不使用它维护患者姓名。原 `SampleEditForm` 对该显示字段应用 `FULL_NAME`，而配置的姓名字符规则不允许逗号。实际 Bean Validation 与实际 MVC 入口均可复现该字段被拒绝。

本次仅将 `SampleEditForm.patientName` 改用字段局部 `Pattern("[^<>]*")`，保留中英文、逗号等普通显示文本，拒绝尖括号。原姓名字符规则本就不接受尖括号。患者可编辑姓、名及申请医生姓、名继续使用原有 `ValidName`。没有修改共享姓名字符集、权限、患者资料、编号校验、改号流程、XML、新增标本、事务或测试夹具。

原编号问题的早期猜测已被实际校验排除：只读申请号长度为 20，实际 `SiteYearAccessionValidator` 返回 `SUCCESS`。不再依据错误的长度判断修改编号规则；显式改号继续执行原格式与重复校验。

## 局部验收

代码基准：隔离候选 `afb7d437d1f98a206efc2007dc709f34aaf01cd0`。证据目录：交付工作区 `outputs/lis-six-batch-20261013/modify-order-400-diagnosis-a12/`。

| 检查 | 原实现 | 候选实现 | 验收边界 |
| --- | --- | --- | --- |
| 实际 GET 经既有前端 payload 构建器得到的字段投影、实际 Bean Validation、实际编号与旧表单校验，共 6 项 | 5 通过、1 失败；只读姓名被拒绝 | 6 通过 | 只读响应与配置在本地重放；未向运行系统重新提交 |
| 原 MVC 校验类 21 项，增加显示姓名和姓名边界 4 项，共 25 项 | 23 通过、2 失败；中英文带逗号显示姓名均返回 400 | 25 通过 | 实际控制器、JSON 转换器、Bean Validation、旧自定义校验；持久化、权限等服务为 mock |
| 两个 Java 文件限定离线 Spotless | 不适用 | apply、check 通过 | 不运行全仓格式化 |

新增回归分别覆盖西文 `Smith, John`、中文 `张, 伟` 原样提交及原申请号保持、显示字段拒绝 script / b 标签、换行夹带的标签及单独尖括号、真正可编辑患者和申请医生姓名仍接受中文且拒绝逗号组合及 HTML。原 MVC 中非法改号、重复改号、合法改号、403、XML、标本身份等场景原样保留。

首次候选使用已有 `SafeHtml.NONE`。非作者审查发现共享 `HtmlValidator` 的预检正则不跨行，`Smith,\n<b>John</b>` 会提前放行。扩展同一 MVC 负向后首次候选实际为 24 通过、1 失败，改为当前字段局部 Pattern 后同 25 项全部通过。没有修改全局 HTML 校验器；第一次候选及其通过记录保留，不能作为最终候选的安全证明。当前最终候选的实际 GET 字段诊断仍为 6 项通过。

6 项诊断的早期编号负向误用合法值，已有失败记录保存在 `initial-number-control-issue/` 与 `initial-valid-number-literal-issue/`，更正后基线仅姓名一项失败。首次外部 MVC 编译遗漏仓库 `pom.xml` 的 `-parameters`，导致四项原 GET 测试无法绑定参数；原记录保存在 `mvc-initial-compiler-parameters-issue/`。补齐与仓库一致的编译参数后得到上表的 23/2 → 25/0，未改变产品或测试预期。

## 命令与交付状态

- `python3 run-candidate-validator-v2.py`：只读响应字段诊断；原结果已保存，目录为单次输出，勿覆盖原始证据。
- `python3 run-mvc-regressions.py baseline` 与 `python3 run-mvc-regressions.py candidate` 保留原字符校验问题的红绿记录。最终安全边界命令为 `python3 run-mvc-regressions-v2.py baseline-v1` 与 `python3 run-mvc-regressions-v2.py candidate-v2`：使用既有离线类路径，重新编译实际源码和已有 MVC 测试类；具体参数、源码与日志哈希见各目录 `verification.json`。
- 格式命令及结果见 `spotless-v2-result.json`、`spotless-v2.log`。

本记录对应外部候选局部验证。本项子任务没有 HTTP 登录、临床写入、正式库修改、提交、推送或部署；根任务的集成状态另记。新的 WAR 上原修改申请业务场景仍须完整执行；局部通过不等于原 a12 保存已成功或发布验收已完成。
