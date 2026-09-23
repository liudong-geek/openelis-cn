# A-02 结果待办部署与实页复核

补记：以下保留3e发布时的真实问题和历史镜像。后续已在候选实页验证同会话掩码轮换后的只读查询修复，结果写保护仍保留；当前后端审核子批与结果队列回归见 [整合验收](a02-a03-integration-acceptance-20260923.md)。不要将本文旧问题状态当作新候选已发布或整项已关闭。

本记录对应源码 `3e1e3b402fc549236c28446cc53cd652c913385b`，已提交并正常推送既有功能分支、远程读回一致。后端和前端已分别部署。**实页发现的多标签会话误判尚在修复，本记录不能作为A-02验收完成证明。**

## 已通过的实际核验

- 后端 healthy；WAR SHA256 `81dccc9a863195c905ad4f1ea8fcd830a5d1ed837e2b0e62af1a7e5b90d9262a`。镜像 `sha256:0f137db04068b3fe97ca0db7616047dec7678bac2f2427672b5368e5304d9cf2`，容器 `68ce49ba405cbf2b6d858368bc1292a652afe1b52732d447988197cf030ff7d0`。
- 前端镜像 `sha256:995381da96482a3c5e220e243f25148d5fc50b901352d28963bc55cf20b5fffb`，容器 `aefcbae1fd63fa65a5ba83b1cf064e5fcc67a27505aa5758da3e4f81cce009ba`。正式入口与version清单、index JS/CSS及source map逐SHA匹配；深链返回no-cache。
- 后端15环境变量按键值比较全部一致，原列表顺序不同不算配置变更；entrypoint/cmd/user/workdir/健康检查、8挂载、端口、资源限制和重启策略保持。数据库/代理容器ID未变，仅4核心容器运行。
- 独立本地测试会话的实际待检接口：25个不同analysis、8个合法实管身份、25展示行；legacy total仍25。ID集合指纹与部署前一致 `8436fb01901e287896ca471700489e4e954832644b06cb3b579740d9a481df50`。不把这些示例数量写成产品规则。
- 轻摘要25/8/null/partial、完整同次列表摘要25/8/25/ready；旧首页第一页25项来自同集合，伪造userId不改变集合，越界页400，匿名摘要302且不披露计数。首次验证脚本误用了setter名称orderDisplayBeans，按实际getter JSON字段displayItems修正后通过；产品接口未为迁就脚本而改。
- 编译、定向后端42例及前端3651例结果见本目录 `a02-result-pending-acceptance-20260923.md`；不是完整后端或全套E2E通过。

## 实页发现与修复边界

浏览器重新登录后，其他指标可用而新版待录入摘要显示登录失效；刷新该卡片不能恢复。后端同一测试cookie连续3次/session返回同userId/sessionId而不同csrf；Spring Security 6.2.8默认XOR CSRF掩码每次请求变化。hook把共享localStorage.CSRF与本标签context.csrf严格比较，误将合法掩码轮换当身份变化。

最小修复已安排：摘要读取前后核验服务器当前身份及权限范围，轮换不冒充登出，storage变化中止旧读并隐藏旧数，不写回共享令牌。不能只删除检查而允许旧context展示新账号数据。结果写入、报告发布等历史消费者也有同类判断，登记为A-01独立合同/回归，不能声称本次摘要修复覆盖所有写入会话。

## 证据与回退

受控本地证据位于 `/Users/ld/Projects/openelis-cn-delivery-evidence/20260923/a02`；最新临时记录在 `/private/tmp/lis-active-20260923/a02-runtime-*.json`、`a02-session-rotation-runtime.json` 和部署日志。原始截图及含环境变量的备份只保存在本机，不能加入公开源码提交。

回退镜像tag：`openelis-cn-webapp:before-a02-20260923`、`openelis-cn-frontend:before-a02-20260923`。后端精确保留部署配置在证据目录runtime-backup（0700目录/0600文件），含机密不复制到Git。回退只替换对应服务，不恢复/删除数据库。

A-02审核/报告/电子申请仍未闭环；本子批实页缺陷修复后须重新核验、追加准确提交和运行版，再更新台账。
