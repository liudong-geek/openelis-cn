# OpenELIS-CN 合成性能与稳定性基线

本工具为 O02 记录一个可重复、边界清楚的本机基线。HTTP 负载固定为匿名 `HEAD http://127.0.0.1:18080/login`，数据库负载固定使用 `pgbench` scale 1 数据，并且只写入程序创建的 `openelis_o02_perf_` 临时数据库。演练前后检查数据库、应用和代理健康状态，结束后强制删除临时数据库。

默认只显示说明。实际运行必须显式提供 `--run`、报告目录、Docker 绝对路径和本机 Unix 套接字。请求数、并发、数据库时长和客户端数都有硬上限；工具不接受远程 URL、远程 Docker 或现有业务数据库名。

```sh
node --test scripts/ops/openelis-cn-baseline.test.mjs

node scripts/ops/openelis-cn-baseline.mjs --run \
  --output-dir /绝对路径/openelis-o02 \
  --docker /usr/local/bin/docker \
  --docker-socket /Users/用户名/.docker/run/docker.sock \
  --http-requests 240 \
  --http-concurrency 12 \
  --database-seconds 15 \
  --database-clients 8
```

报告记录 HTTP 成功率、吞吐及 P50/P95/P99/最大延迟，数据库事务数、失败数、平均延迟和 TPS，以及负载前后的容器资源快照和健康状态。HTTP 只有零错误且 P95 不超过 2 秒才通过；数据库必须完成事务、零失败且 TPS 大于零。

登录页负载只反映本机代理和静态/入口链路，`pgbench` 只反映隔离 PostgreSQL 基础能力。它们不代表患者检索、结果保存、报告生成、HIS、仪器、高峰业务模型或长时间运行。医院提供真实日量、峰值并发和脱敏场景后，仍需以签字负载模型执行核心查询 P95≤2秒、保存 P95≤3秒及持续运行测试。
