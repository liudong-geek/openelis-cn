# M1-A2：当前报告主体与数据库用户绑定

日期：2026-09-11；归属[交付计划v3](delivery-execution-plan-v3.md) M1-A。状态：限定红绿回归、独立源码审查及新增代码覆盖门禁通过；未接实际报告入口、未部署，不关闭M1或报告P0。

## 有限范围与验收断言

仅加强既有 `ReportAnalysisAuthorizationService.authorizeExplicitScope` 的身份绑定，复用 `SystemUserService.getMatch`、`LoginUserService.getMatch` 的唯一查询及既有REPORTS实际专业组授权。旧 `authorize` 不在本批改变，持久完整报告组、申请级版本、封存签名/事务/旧入口收敛仍按M1-A～D后续实施。

- 主体A不得携带用户B的ID使用B的专业组权限，即使双方均有REPORTS。失败在读取申请/患者/成员之前发生。
- 接受已认证、持有REPORTS的已知 `UserDetails`、`Saml2AuthenticatedPrincipal`、`OAuth2User`；拒绝匿名、remember-me、daemon及任意字符串/不明主体。
- 登录名非空且不带首尾空白，与Authentication名称、唯一SystemUser登录名精确一致；不得裁剪或忽略大小写猜配。SystemUser ID须等于参数中的规范正整数ID，且活动标记为Y。
- 本地UserDetails四个账户状态均有效，另从唯一LoginUser重验登录名、派生systemUserId、未禁用、未锁定和密码剩余天数；不把LoginUser自身主键当系统用户ID。不比较或输出密码。
- SSO只按已验证的SSO主体映射活动SystemUser，不要求本地LoginUser/本地密码；这不是SSO过滤链或真实厂商身份验收。
- 映射结束、整个授权成功返回前，当前Authentication/Principal与入口捕获对象相同、身份名称及状态仍有效。身份映射/主体读取异常及未知映射统一拒绝，不携带原始账号/数据库错误给调用方；这不代表既有Sample/Analysis等全部查询异常均已净化。
- 保留既有完整成员及实际专业组授权，不能改成筛选可见子集。

## 工程与测试边界

限定M0-E复用上一批可读的Java21、旧应用Jar及原Maven缓存作为依赖；显式重新编译当前目标实现和测试，不借用旧测试class。新增SSO依赖为原缓存同一Spring Security 6.2.8的oauth2-core、oauth2-client和saml2-service-provider，没有下载或升降版本。旧应用Jar仍是旧快照，不代表完整当前源树已构建。

测试均为SIM对象与依赖mock。SystemUser/LoginUser底层DAO存在云占位，不能把mock的唯一查找或账户标志当真实数据库约束、缓存撤销及时性、并发及认证过滤链的证明。没有表变更、接口、页面、真实用户/患者写入或报告签发。完整源码、依赖、环境、发布及现场验收门禁继续保留。

修改前限定源码存档：`tmp/report-principal-binding-20260911/baseline/source-before.tar.gz`，SHA-256 `3630c883da8f37ec5f079bce6aa73d1ab6a9f4e0a8710becfb145786fad1747c`。这是源码基线，不是数据库备份或可部署回退版。

## 实际回归

- 旧55项显式组测试仅适配有效SIM身份fixture，原47项旧入口测试完全保留；102/102基线通过，0.997秒。
- 新53项加入后，使用尚未实现绑定的真实旧方法执行红轮：155项执行，49项失败，1.061秒。包括主体A借用B、缺失数据库映射、失效账户、上下文切换等未拒绝，以及正向缺少身份校验查询；不是编译或启动失败。
- 实现后首绿155/155通过，1.036秒；Java21重编译当前两个实现文件及三组测试，源码及25项依赖输入前后指纹一致。该数字不包括完整项目、数据库或浏览器验收。
- 主代理审查后补强daemon带REPORTS与合法UserDetails时的明确拒绝，并补畸形权限集合的清洁拒绝。补强红轮158项实跑、1项失败（REPORTS之后的null权限被短路放行），1.347秒；修复后最终回归158/158通过，1.447秒，0跳过、编译无告警；全部5份受测源码及25项依赖指纹前后一致。56新主体测试＋55既有显式组测试＋47旧入口测试，不与其他批累计。
- 独立角色对最终代码/3项补强测试和158项红绿日志差量复核通过；旧入口、47项旧测试及Scope定义逐字不变。[独立审查记录](../../tmp/report-principal-binding-20260911/independent-review.md)。

证据：[首红](../../tmp/report-principal-binding-20260911/red/junit.log)、[首绿](../../tmp/report-principal-binding-20260911/green/junit.log)、[补强红轮](../../tmp/report-principal-binding-20260911/review-red/junit.log)、[最终绿轮](../../tmp/report-principal-binding-20260911/review-green/junit.log)、[重复执行脚本](../../tmp/report-principal-binding-20260911/run-unit.sh)。

## 环境、交互及下一步

00:47在当前沙箱执行同一限定只读预检，18通过/7阻断/2未知，与上批同一清单无变化，工具指纹一致；这是探针计数，不是系统测试成绩。[比较结果](../../tmp/report-principal-binding-20260911/preflight/sandbox/comparison.json)。沙箱外复核的审批等待已中断，未重试，也不将UNKNOWN判成服务已关闭。

关键源码/Git及依赖云占位仍存在，当前本地HTTP未获得新的健康证据，完整Spotless/构建与发布门禁未通过。本轮不替换运行版、不迁移数据库、不读写真实患者或签发报告；仅新增源码存档，不冒充数据库备份与部署回退。

本批产品交互复核仅到安全合同：不允许用传入用户ID切换权限；身份无效先于读取患者/申请；在途身份改变不得把旧授权成功返回。实际页面、登录过滤链、SSO端到端和数据库事务没有执行，不作为已验。待接入时需验证中文的重新登录/无权提示、保留查询上下文、不自动重试签发，以及各岗位直接访问与界面一致。

下一有限批仍在M1-A：服务端持久完整报告组解析及其真实数据关系验证，不能把客户端勾选项目列表当完整组。之后申请/报告级版本、封存内容与签名绑定、真实事务/并发、旧入口关闭依M1-B～D执行。院方分组/签章、真实主数据、HIS、设备、打印及UAT材料未确认，不用模拟结果关闭正式门禁。

## 最终限定覆盖率

01:06使用原缓存JaCoCo0.8.12与ASM9.7对最终 `review-green/classes` 新采集执行数据，158/158再次通过（1.028秒）。5份源码先匹配最终编译基线，源码、25项运行依赖、工具和class前后指纹一致；精确匹配两实现类及新增私有主体记录，未合并旧exec。

| 范围 | 行覆盖 | 分支覆盖 |
| --- | --- | --- |
| 新身份绑定 `requireBoundReportPrincipal` | 32/32，100% | 38/38，100% |
| 新上下文复核 `requireUnchangedReportPrincipal` | 10/10，100% | 9/10，90% |
| 新完整权限集合 `hasExplicitReportsAuthority` | 6/6，100% | 8/8，100% |
| 新主体类型/名称 `reportLoginName` | 13/13，100% | 20/20，100% |
| 私有主体记录 `ReportPrincipal` | 1/1，100% | 无可计分支 |
| 修改后的显式组入口 | 26/27，96.30% | 33/34，97.06% |
| 整个既有授权服务（含大量旧路径） | 336/426，78.87% | 283/383，73.89% |

新增上下文复核的最后一项Authentication名称不匹配分支未命中；既有显式组最终成员集合防御拒绝分支仍未命中。如实保留，未删除保护追求100%。Scope定义本轮行/分支100%是重新采集结果，不表示报告全部逻辑或项目覆盖率。

[原始计数](../../tmp/report-principal-binding-20260911/coverage/attempt-01/report.log)、[XML](../../tmp/report-principal-binding-20260911/coverage/attempt-01/coverage.xml)、[HTML](../../tmp/report-principal-binding-20260911/coverage/attempt-01/html/index.html)、[执行与一致性](../../tmp/report-principal-binding-20260911/coverage/attempt-01/result.json)。覆盖率不代替真实数据库、SSO链路、页面或现场验收。

最终限定源码与台账存档：[source-m1-a2.tar.gz](../../tmp/report-principal-binding-20260911/source-m1-a2.tar.gz)，其校验及关键红绿/覆盖证据见[指纹清单](../../tmp/report-principal-binding-20260911/milestone-evidence.sha256)。仅冻结本批明确文件，保留修改前源码档和历史A1证据，不是部署包、数据库备份或经过演练的运行回退版。
