# 本地交付准备预检：只观察，不放行

本工具记录一组明确的本地环境前提，帮助识别缺失文件、云占位和选定运行工具的问题。它不是修复器、构建器、完整测试门禁或临床交付验收。即使所有探针通过，也不能关闭 M0 或 G0–G11。

## 使用

需要本机已有 Node.js 20 或以上；不依赖 `node_modules`，不安装任何包。

```sh
# 默认只显示说明；不检查文件、执行版本命令或请求服务
node scripts/check-delivery-readiness.mjs

# 离线自测：只使用 SIM 临时文件及注入的运行工具/HTTP探针
node --test scripts/check-delivery-readiness.test.mjs

# 明确获准后观察当前环境；不指定 Maven 缓存时该项为 UNKNOWN
node scripts/check-delivery-readiness.mjs --run
```

当前工程此前失败的原 Maven 缓存可显式选择，不用备用缓存冒充原构建链路：

```sh
node scripts/check-delivery-readiness.mjs --run \
  --maven-repo /Users/ld/Documents/program/maven-repo \
  --docker-socket /Users/ld/.docker/run/docker.sock
```

可追加 `--java /绝对路径/bin/java` 明确选定已安装的 Java 21；否则使用当前 `PATH` 找到的 `java`。只运行这个程序的 `-version`，不自动查找替代 JDK，不使用 Maven、SDKMAN 或安装器。子进程不继承 `JAVA_HOME`、`JAVA_TOOL_OPTIONS`、`JDK_JAVA_OPTIONS`、Docker 上下文、远程 Docker 地址或代理覆盖；默认 Java 选择可能因此不同于原终端的环境选择。输出记录实际选定路径，原构建仍需单独确认。

默认 Docker 端点固定为 `unix:///var/run/docker.sock`；`--docker-socket` 只接受绝对本机 Unix 路径，不接受 TCP/SSH/HTTP 端点。选定套接字不存在或不可检查时为 `UNKNOWN / SELECTED_SOCKET_UNAVAILABLE`，不推断整台机器的 Docker 状态，也不尝试其他上下文。可达时仅请求选定本地 Docker 服务端版本；不列容器、查看日志、读容器环境或执行容器命令。

## 检查范围

- 固定 16 个文件：Maven 工程文件、前端包/锁文件和 Vite 配置、已知失败的 `external-connection.xml` 与嵌套 `picomatch/lib/parse.js`、Vitest 入口、两个旧候选验收测试，以及本批备注审计实现/集成测试/037迁移/患者日志组件与专项测试、`.git/HEAD`、`.git/index`。完整清单以脚本 `FILE_MANIFEST` 为准。
- 显式选择的 Maven 缓存内，仅检查 `maven-resources-plugin/2.6/maven-resources-plugin-2.6.pom`。不读取 Maven 配置，不声称该缓存就是构建实际使用的缓存，更不据此证明全部依赖完整。
- `.git/objects/pack` 只枚举文件名，对最多 64 个符合固定命名的 `.pack/.idx/.rev` 检查元数据；不读取 Git 对象、不运行 Git 状态或差异命令。目录不可用、没有观察到 pack、名称无法安全识别或超限均不能通过。未扫描松散对象、子模块、工作树指针、Git配置或全部源码。
- Node 为启动本工具的实际进程；Java 为显式或 PATH 选定程序，要求报告 Java 21；Docker 为明确本机 Unix 套接字上的服务端版本。版本可读不等于能编译或能部署。
- 对固定 `http://127.0.0.1:18080/login` 发送一次匿名 `HEAD`，不认证、不携 Cookie、不跟随跳转、不请求业务路径、不读取或打印响应正文/响应头。只有 HTTP 200 记该探针通过；其他状态只表示这次 HEAD 不满足预期，不能诊断完整应用。可达也不等于已登录、岗位权限正确或当前源码已部署。服务器可能记录普通访问日志，不能宣称外部状态绝对零变化。

## 安全与结果解释

macOS 使用系统 `stat` 的 `SF_DATALESS` 数值标志。所有目标只检查元数据，云占位正文不会被打开。非空文件元数据存在不等于正文可读；空文件与稀疏文件不靠分配块数猜测云状态。源码或 Git 文件符号链接不会被主动跟随；仅明确选定的可执行程序和 Docker 套接字允许按本机符号链接检查最终目标的元数据。元数据不支持的平台、权限错误、无法解析输出和超时均为 `UNKNOWN`，不伪装成绿色。

每个外部子进程和 HTTP 探针最多 3 秒；子进程输出最多 64 KiB。无 shell、无自动重试、无配置写入、无源文件修补、无下载/云端恢复、无依赖安装、无构建、无测试全量调用、无启动/重启服务、无数据库访问、无业务读取或写入。只输出固定检查代码、选择路径、受限数字版本/字节数和 HTTP 状态，不转发进程原始输出、环境、Cookie或服务正文。单个探针时限不等于总时限；当很多文件逐一超时时总耗时会增加。

| 退出码 / outcome | 含义 |
| --- | --- |
| `0 / NO_PROBE_BLOCKERS_FOUND` | 本次有限探针未发现阻断；全部交付保证字段仍为 `NOT_VERIFIED` |
| `1 / BLOCKED` | 至少一个明确阻断，例如缺失、零长、云占位、选定 Java 非21或登录 HEAD 非200 |
| `2 / INCOMPLETE` | 没有明确阻断，但存在未知/未选择项，或参数/探针内部失败；不得推断通过 |

先解决实际发现的问题，再独立恢复完整源树/Git/依赖核查、标准构建和受影响回归。不得自动运行 `run-e2e-like-ci.sh`（默认会删卷并重建夹具），也不得复用旧候选认证/申请工具扩大到登录或患者读取。旧部署、历史备份和专项 JUnitCore 成绩不能替代本批发布证据。

## 自测范围

自测包含真实小型 `SIM-lis-readiness-*` 临时文件的缺失/零长/类型差异；仅删除测试自己创建的临时目录。进程版本、云占位标志和 HTTP 边界使用注入，不启动 HTTP 服务、不连接运行 Docker、不登录、也不装载数据库夹具。负向用例检验失败、超时、权限错误、无效输出、旧 Node/Java、Git扫描上限、云占位可执行程序和错误 HTTP 状态会改变结论；硬编码返回通过会破坏这些断言。

这些仅证明预检脚本自身的限定行为，不是业务回归、真实云端恢复试验、临床安全或正式交付通过记录。
