# OpenELIS-CN 隔离健康、备份与恢复演练

本工具为 O01 提供可重复的本机验证：检查现有容器健康；生成 PostgreSQL 自定义格式备份及 SHA-256 清单；把备份恢复到程序生成的临时数据库，比较表、列、约束和 Liquibase 变更集计数，然后强制删除临时数据库并再次检查服务健康。

默认执行只显示说明。实际操作必须同时提供 `--run`、Docker 可执行文件绝对路径和本机 Unix 套接字绝对路径。工具不接受远程 Docker 地址，不读取或输出数据库密码，不打印患者或业务表内容。恢复数据库名只能使用 `openelis_o01_restore_` 前缀，不能把备份覆盖回 `clinlims`、`postgres` 或其他已有数据库。

```sh
node --test scripts/ops/openelis-cn-recovery.test.mjs

node scripts/ops/openelis-cn-recovery.mjs all --run \
  --output-dir /绝对路径/openelis-o01 \
  --docker /usr/local/bin/docker \
  --docker-socket /Users/用户名/.docker/run/docker.sock
```

也可分别运行 `health`、`backup` 和 `restore-drill`。`restore-drill` 必须同时指定 `--backup`、`--manifest` 和 `--output-dir`。数据库容器、应用容器和源数据库默认分别为 `openelis-cn-database`、`openelis-cn-webapp` 和 `clinlims`；需要覆盖时使用 `--database-container`、`--webapp-container`、`--source-database`，名称只接受安全标识符。

备份目录和清单权限设置为仅当前用户可读写。清单只记录备份时间、文件大小、摘要和结构计数，不包含密码、连接串、患者字段或业务记录。恢复成功报告中的 `isolatedDatabaseRemoved: true` 表示临时恢复库已经清理；如果清理失败，命令直接失败，不能把演练记为通过。

这项演练验证当前本地合成环境的容器健康和数据库逻辑备份可恢复性。它不等于医院生产安装、异机/异地恢复、附件与密钥恢复、加密介质、RPO/RTO、灾备切换或正式运维签字。生产使用前仍需结合医院拓扑、账号、容量、备份存储、密钥托管和批准的恢复窗口执行完整验收。
