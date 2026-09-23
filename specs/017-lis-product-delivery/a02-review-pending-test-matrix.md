# A-02 审核待办合成测试矩阵（待实施，未执行）

源基线 `3e1e3b402fc549236c28446cc53cd652c913385b`。JSON fixture 描述使用命名状态，不依赖运行医院字典 ID。必须在新建的任务专属合成数据库或隔离 unit fixture 中落地，禁止写现有临床记录。

## 基础样本的精确期望

Actor reviewer-1 仅有实际检验组101的审核权限。普通非 RETROCI 模式：

- 技术拒绝开关 false：可见 Analysis ID `[1,2,7,8,9,10,11,13]`，analysisCount=8、accessionCount=3；完整投影9行，QC受阻项目1个（ID9）。
- 开关 true：加 ID4，analysisCount=9、accessionCount=3；完整投影10行，QC受阻仍1。
- ID2 的 Test 当前属于组102，但 Analysis 属101，因此可见；ID3 相反，必须不可见。
- ID7已发布、ID8已打印，继续包含在上述数字和列表，但服务器只读、禁止接受/退回。ID5生物审核退回、ID6已完成、ID12待录入均不进审核白名单。
- 轻摘要非空两种开关分别回 `8/3/null/null/partial` 或 `9/3/null/null/partial`（次序 analysis/accession/displayRows/QC/state）；完整 context 才可回 `8/3/9/1/ready` 或 `9/3/10/1/ready`。

测试 fixture 必须建真实 Result→TestResult/组件引用，不用断外键冒充 NULL 主组件或未活动组件。多选类型取现有枚举的实际值；不能猜一个字符。

## 验收矩阵

| ID | 设置/操作 | 必须断言 | 验证层 |
|---|---|---|---|
| R01 | 基础fixture，拒绝开关false/true | 上述精确成员与计数；实际DAO列表与scalar聚合一致 | 真实ORM+DB |
| R02 | Test字典迁组（ID2/3） | 依Analysis实际组授权；summary/page/context一致 | DAO+权限service |
| R03 | 空审核组；撤销角色；登录组限制；AllLabUnits | 真空与403/配置失败区分；无隐式管理员跨组；无请求userId影响 | service+HTTP |
| R04 | ID7/8发布/打印残留 | 仍在列表/count；readOnly不能被前端false覆盖；提交仍被阻止 | 投影+context+保存回归 |
| R05 | 组101筛选、精确A、受理号range、日期 | 原参数含义保留，filtered摘要只属于该查询；与pending总数标签不同 | Controller+UI |
| R06 | GET无筛选，无scope | unqueried、四数null、无queryId、searchFinished=false；不得0/ready或“无结果” | HTTP+UI |
| R07 | 显式pending；scope+非空筛选；未知scope；doRange=false | 全scope真正查询；歧义400，不忽略条件；已有filtered不回归 | HTTP |
| R08 | validationPageSize=2 | A受理号3行整组留同页；各页summary仍代表全context；不按pageSize推总行数 | context+UI |
| R09 | scope丢失/篡改、他actor token、无token、无效页、过期、多tab | 409/403；不读共享旧cache；不篡改其它查询 | context+HTTP |
| R10 | 取得配置后、中途查询期间false→true或true→false | 409整次作废，不出现旧count+新rows；重查按新配置 | service并发受控桩 |
| R11 | 旧token后开关/登记模式/去标识切换 | 翻页/提交409重查；旧患者数据不披露 | context+UI |
| R12 | 无结果ID11、null值ID13、ID2两组件、ID9多选三值 | 成员保留；行数9/10由实际投影得到；不以Result条数代替行数 | 现有utility投影回归 |
| R13 | ID9两条REJECTION违规、两个组件/多选；WARNING/RESOLVED；manual ID10 | QC distinct分析=1；人工无analyzer不误阻；总待办不扣减；接受禁用退回可用 | QC+context+UI |
| R14 | 查询后解决QC或新出现QC | snapshot时间明确；保存仍检查当前QC；不得由旧summary绕过 | QC保存回归 |
| R15 | RETROCI；NotRegistered/无历史/无初始化map | 未验证轻聚合为null/partial，不伪0；现代投影按核定旧语义且请求缓存隔离 | utility+service |
| R16 | 必需状态缺失/空白/非正/碰撞；DAO/配置查询异常 | 明确失败，不报告0或ready；不得扩大状态集合 | service+HTTP |
| R17 | accession空白或同analysis出现冲突sample身份；重复/损坏投影 | accession/投影不能确认时partial；不修改实际返回成员掩盖异常 | summary unit |
| R18 | 首页轻摘要调用 | 不调用患者/result/utility/context，不取全实体集合；非空可确认两数，其余null | interaction+DAO query |
| R19 | 首页legacy审核钻取，伪造userId、外来cache、第二页 | 同current actor实际组候选；维持原JSON/页配置；不得返回全局患者清单 | provider/service回归 |
| R20 | 请求A迟到、切换scope、会话失效、提交中导航 | 现generation/AbortController/dirty guard保持；旧summary不盖新队列；未知/403不显示0 | frontend |
| R21 | 授权已确认无候选 | pending summary四个0/ready；真实空context可显示无待审，但空白未查询不等同此态 | service+UI |
| R22 | 大单受理号超过pageSize；规模超本批可承受范围 | 不拆单、不静默截断；若容量不足明确阻塞，不伪装全队列已完成 | context+人工演示 |

本批必做R01–R14、R16–R21与R22基础分页；R15只对已证实路径宣称完成，否则记录RETROCI未闭环。全量真实医院性能、旧MVC重构不靠此矩阵声称验收。

## 证据要求

每项记录实际测试名/结果、源码commit、真实数据库是否仅合成、临时库创建删除状态。复用上一批安全runner时必须修改所选测试清单和数据库前缀保护，不能仅继承“42通过”结论。本次只是样例设计，没有测试执行记录。
