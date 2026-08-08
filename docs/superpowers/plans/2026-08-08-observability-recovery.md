# 生产观测、告警与恢复演练计划

> 用户已授权处理“监控/告警/备份恢复/回滚验证”部分；真实 provider 生成由用户手动测试，本计划不代替该验收。

## 目标

让单机 Docker Compose 生产栈具备可持续的健康检查、可选 webhook 告警、备份新鲜度监控、非破坏性 PostgreSQL 恢复演练，以及只读回滚预检。所有检查必须能在当前 2C2G 服务器上运行，不增加第二套数据库或持久化监控系统。

## 架构边界

- 保留 Loki/Alloy/Grafana 作为日志观测；新增一个轻量 `monitor` profile 服务，从 Docker socket 读取核心服务状态，并从只读宿主机挂载读取磁盘使用率。
- 告警接收地址使用 `MONITOR_ALERT_WEBHOOK_URL`，不在仓库中假设 Slack、飞书或邮件供应商；未配置时仍记录故障，但不声称通知已送达。
- 备份恢复演练只创建临时 PostgreSQL 容器和临时卷，禁止连接或覆盖生产数据库。
- 回滚预检只检查指定 SHA 镜像和 Compose 预期，不修改 env、不 rsync、不执行 `up`；真实回滚仍使用既有显式命令。

## 实施步骤

1. 更新 `infra/docker/docker-compose.prod.yml`，加入 `monitor` 服务、状态卷、只读 Docker socket/宿主机挂载和资源上限；为观测服务补健康检查与启动文档。
2. 新增 `infra/scripts/production-monitor.sh`，支持 `once`/`loop`，检查 API ready、api/worker/postgres/backup 容器、备份新鲜度和宿主机磁盘，按故障指纹去重并发送可选 webhook。
3. 新增 `infra/scripts/restore-rehearsal.sh`，对指定 `.sql.gz` 执行 gzip 校验、临时 PostgreSQL 导入、关键表存在性检查和自动清理；新增 `prod:restore:rehearsal` 命令。
4. 为 `infra/scripts/deploy-rollback.sh` 增加 `--dry-run`，并保留真实回滚的现有行为；在 `docs/03-ops.md` 记录演练流程、告警配置和恢复边界。
5. 更新部署脚本同步新脚本/配置，并为观测 profile 明确 pull/启动顺序；补脚本语法和配置单元测试。

## 验证

- `sh -n infra/scripts/production-monitor.sh infra/scripts/restore-rehearsal.sh`。
- 运行监控的 `once` 模式模拟 API/worker/backup 缺失、备份过期、磁盘阈值和恢复状态；验证相同故障不重复告警，恢复时发一条恢复通知。
- 对测试生成的 gzip SQL 备份运行恢复演练；不触碰生产数据库。
- `pnpm run verify`、`pnpm run build`，然后仅在目标服务器上启动 observability profile 并检查容器状态、Loki ingest 与 Grafana health。

## 未代替的人工验收

- webhook 接收方的真实可达性和消息呈现；
- 生产 OSS 备份对象的跨主机恢复；
- 真实 provider 生成、队列完整生命周期和用户浏览器验收。
