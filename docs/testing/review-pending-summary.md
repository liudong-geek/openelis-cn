# A-02 待审核：后端定向验证

范围基线：`3e1e3b402fc549236c28446cc53cd652c913385b`。实施合同见 `specs/017-lis-product-delivery/a02-review-pending-contract.md`；合成样例与 22 项矩阵在同目录。本文记录验证方法，运行结果另行追加；不能因存在测试文件就视为通过。

## 当前候选行为

- 首页 `/rest/review/pending/summary`、现代 `/rest/AccessionValidation?scope=pending` 与旧首页审核 JSON 钻取分支共享实际 `Analysis.testSection.id` 授权和 TechnicalAcceptance/可配置 TechnicalRejected 范围。没有按 Test 当前组替换历史实际组权限。
- 轻摘要通过 scalar 聚合读取，不加载患者、全部结果或 Analysis 实体。普通模式非空只确认 analysis/accession 两数；display/QC 是 null，state=partial。RETROCI 非空四数 null。确认空才四个 0/ready。
- 完整查询从同次已授权投影生成 context 和摘要，页间复用生成时间及全查询计数。未输入筛选条件为 unqueried，不创建空提交令牌。
- 已发布/已打印残留继续可见、继续计数，服务器强制只读；原写守卫仍拒绝提交。QC 计数是受阻 Analysis 子集，不能从总数相减称为可放行。
- 配置/权限快照由服务器保存。翻页和提交重新校验；保存开始、签名之后、更新之后及 beforeCommit 原检查点核对同一快照。发生变化抛异常回滚，不自动重试。内存配置没有被数据库事务全程锁定，此方案只保证在这些检查点检测变化。
- 原 save API 保留，捕获当前服务器策略；现代 query-bound save 使用已保全的服务端策略，客户端不能自造快照。
- RETROCI 现代登记查询使用每次投影内的缓存：可识别 NotRegistered 排除，可识别登记状态保留；缺登记类型、空历史或未知状态明确503。旧公开 group/count 方法的历史无记录行为保持兼容，不扩改旧MVC。结果读取返回 null 是失败；正常空集合复制后补展示空行，不修改 DAO 集合。

## 可复现运行

需要 Java 21、Maven 和已经运行的本机 PostgreSQL 容器；脚本不启动容器、不重建服务：

```sh
python3 scripts/test-review-pending-summary.py \
  --container openelis-cn-database --port 25432 \
  --maven /path/to/mvn --maven-repository /path/to/isolated-cache \
  --goal test
```

打包时同一脚本使用 `--goal package`；不跳过所选测试。测试单 fork，Maven 最大 1 GB，测试 JVM 最大 768 MB。测试名单写在脚本中，既有上下文/写守卫/签名/QC/投影测试都实际运行，不能继承上一子批“42 通过”的结论。

隔离约束：

- 随机新建 `lis_a02_review_test_YYYYMMDD_<random>`；创建前查不存在，拒绝覆盖已有库。
- 从 clinlims 只复制所列生产表的 schema-only/pre-data，不读患者数据，不写 clinlims，不复制业务行。该定义不含完整生产索引/外键，不能作为完整临床事务或性能验收；合成 Result→TestResult/组件引用仍按真实实体保持合法。
- Java 连接只允许 127.0.0.1 和审核专属库名前缀，并验证 current_database。连接口令仅存内存和子进程环境，不写代码、报告或命令参数。
- 创建者 finally 仅删除本次创建的库；创建/删除/退出码记录到临时报告目录。日志和 Surefire 报告清理敏感连接参数。

## 证据分层

| 测试 | 能证明的范围 |
|---|---|
| ReviewPendingDatabaseIT | 生产映射及实际 DAO 的状态、实际组授权、已发/打印成员保留、过滤、数据库分页与 scalar 聚合一致；纯合成 13 Analysis |
| ReviewPendingHibernateQueryTest | 生产映射中的 HQL 解析和无权限不查询；不是数据库业务谓词的替代证据 |
| AccessionValidationProjectionTest | 实际 utility 的组件、多选、无 Result、null值投影，以及 RETROCI 每次请求缓存；服务依赖是合成桩 |
| ReviewSummaryFactoryTest、ReviewPendingServiceTest | 计数单位、损坏身份 partial、轻摘要不加载全实体/患者、unqueried 和显式 scope、配置结束校验 |
| ReviewScopeServiceTest、UserServiceImplUnitTest | 实际组角色复用、配置缺失/碰撞、权限或配置变化失效 |
| ReviewQueryContextServiceTest | 全查询摘要与完整受理号分页、scope/actor/context隔离、发布打印只读、QC保全 |
| ReviewPendingRestContractTest、AccessionValidationQueryControllerTest、PendingDashboardPagingTest | ROLE_VALIDATION、请求 actor、旧缓存不串用、HTTP参数/错误与原JSON入口兼容 |
| ReviewSubmissionServiceTest、ReviewWriteGuardTest、QCReleaseGateServiceTest | 原审核保存/签名/QC守卫，新增策略校验及不重试、提交前检查 |
| ReviewSubmissionPolicyDatabaseIT | 实际 Spring SERIALIZABLE + PostgreSQL 事务中，更新回调切换策略后，合成的签名/分析/审计写入全部回滚，外部通知不执行；领域锁读取沿用 SIM guard 桩，不冒充完整医院数据库保存验收 |

## 仍不宣称完成

全后端测试套件、真实医院制度/数据验收、生产规模容量；非空首页精确展示行/QC数；RETROCI 轻量精确聚合；海量审核队列的数据库游标分页；全部旧 MVC 与其它首页指标。上下文依然保存完整查询投影，本批没有静默截断或虚报完整队列。A-02 整项保持未关闭。

## 执行结果

已执行隔离 runner 的 6 个生命周期单测（fake subprocess，无 Docker/Maven）：已有库拒绝、创建失败不删库、复制定义失败后清理、Maven失败后清理、清理失败记录与成功路径均通过。命令：`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p test_review_pending_runner.py -v`。

最终验证通过：Java 21 编译 **2992 个主源码、674 个测试源码**；同一 Maven `package` 实际运行 **121 项定向测试，0 失败、0 错误、0 跳过**，15 个测试类。包含真实 PostgreSQL DAO 成员/聚合/分页 2 项，以及实际 Spring SERIALIZABLE 合成事务探针回滚 1 项；不是全后端测试套件。

专属测试数据库 `lis_a02_review_test_20260923_8ab56d8f`：created=true、dropped=true、Maven退出0；152.96秒。新库中只写合成数据，原 clinlims 仅 schema-only/pre-data 读取。

WAR：`target/OpenELIS-Global.war`，232623499 bytes，SHA-256 `66def8a85693b31addfd6dcd863b38d11e5774c31070c4bd3dcb1ce9706204b7`。后端候选尚未由本子任务提交或部署，运行程序仍由主负责人整合后更新。

33个本批 Java 文件已用既有 Spotless 配置格式化，随后才进行最终编译与测试。`git diff --check` 无错误。验收记录不把第一轮测试源码类型错误或第二轮118通过/3未过抹掉：这些错误已实际复现、修复，并由最终同一121项全部通过覆盖；前三次本任务测试库均已删除。无跳过或扩大错误基线。

测试报告、每轮数据库生命周期、最终源码清单/hash 和 WAR hash 保存在本任务审计产物 `a02-review-backend-evidence.json`，主负责人归档时应把真实提交号和运行版本补入总台账。
