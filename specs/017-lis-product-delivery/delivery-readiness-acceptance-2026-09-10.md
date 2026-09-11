# M0-01：只读预检工具限定验收

记录时间：2026-09-10 22:51（北京时间）。所属计划：[交付执行计划v3](delivery-execution-plan-v3.md)。

## 结论

**预检工具开发验收通过，实际工程环境仍阻断；未构建或部署LIS。** 本批只增加三个工具/测试/说明文件，以及交付计划、台账与本记录。原有业务实现、未提交修改、旧冻结证据、数据库和运行版本未被本批改写。定时任务保持暂停。

## 验证结果

| 项目 | 实际结果 | 证据边界 |
| --- | --- | --- |
| Node内建回归 | 根代理独立复测18/18通过，0失败、0跳过，571.135403毫秒 | 只验证预检工具；真实SIM临时文件＋注入进程/HTTP，不是18条医疗业务验收 |
| JavaScript语法 | 实现和测试文件均通过 | 不等于前端类型/格式/生产构建 |
| 独立审查 | 默认不执行、元数据读取、限定本地端点、无业务写入和UNKNOWN不变绿审查通过 | 初审发现合法Java首发字符串`21`误判；补失败回归后支持`21`/`21.0.9`且继续拒绝`17`，复核关闭 |
| 实际只读预检 | 22:48沙箱内、22:50经授权沙箱外，均18项PASS、7项BLOCKED、2项UNKNOWN，退出1 | PASS是有限探针结果，不是项目就绪；沙箱外重复用于排除仅由沙箱限制导致的不可达 |
| 制品一致性 | 测试前后三文件SHA-256核验一致 | 仅绑定本工具版本，不替代完整源树/Git/依赖核查 |
| 运行版/数据 | 未启动或停止服务、未登录、未取业务数据、未迁移、未签发、未发布 | HTTP仅一次匿名HEAD；服务端可能产生普通访问日志 |

真实探针选定：Node25.6.1；Java21.0.11精确安装路径；原Maven缓存`/Users/ld/Documents/program/maven-repo`；Docker仅`unix:///Users/ld/.docker/run/docker.sock`；HTTP仅`http://127.0.0.1:18080/login`匿名HEAD。

以下7项实际带macOS `SF_DATALESS`标志，仅读元数据，没有打开其正文：

- `src/test/resources/testdata/external-connection.xml`
- `frontend/node_modules/vite/node_modules/picomatch/lib/parse.js`
- `scripts/check-auth-candidate.test.mjs`
- `scripts/check-intake-candidate.test.mjs`
- 原Maven缓存中的`maven-resources-plugin/2.6/maven-resources-plugin-2.6.pom`
- `.git/objects/pack/pack-2285e4ce14db654a0b8eef71833bc2b1bc4e3c17.pack`
- 同名`.rev`

2项未知是：所选Docker Unix套接字不存在；HTTP传输未成功。不能从所选套接字推断本机所有容器引擎状态，也不能凭HEAD诊断完整应用。未执行登录、角色或页面操作检查。

## 可复核产物

- [使用与安全边界](../../scripts/check-delivery-readiness.md)
- [工具源码指纹](../../tmp/delivery-v3-20260910-readiness/tool-source.sha256)
- [独立复测原始输出](../../tmp/delivery-v3-20260910-readiness/node-tests.log)
- [沙箱内预检](../../tmp/delivery-v3-20260910-readiness/preflight-sandbox.json)
- [本机权限复核](../../tmp/delivery-v3-20260910-readiness/preflight-local-confirmed.json)

开发过程先验证模块缺失的红轮；其后独立审查发现Java21首发版本识别问题，新增对应失败回归再修正。前述红轮仅有会话工具输出，本记录不虚构额外红轮文件；归档绿轮是根代理最终独立复测。历史备注审计274项及待执行6项前端测试均不计入本批18项。

## 下一步及不放行项

1. M0-02：在本机文件管理器完整下载现有项目（包含隐藏的Git对象）及原构建所需依赖，再逐项核对；禁止用旧快照覆盖当前改动。正式依赖恢复需精确版本、受控来源和单独验证。
2. M0-E：检查报告安全修复所需代码及增量回归是否具备可执行条件；具备后推进M1-A，不必等待范围签字或HTTP启动。当前只确认独立Node工具可测，临床代码测试条件未由本工具证明。
3. M0-04：另行核对本机既有引擎、数据卷及版本后，按非破坏启动方案恢复。新候选须测试、备份、回退齐备后才能替换；不得执行删卷/重灌夹具脚本。
4. D01仍待用户确认首期专业范围；所有原有功能要求保留。M0整体、报告P0及G0～G11正式出口均未因本记录关闭。
