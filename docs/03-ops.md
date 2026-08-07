# 运维手册（03-ops）

生产部署、日志查看、备份恢复与故障排查。面向单机 Docker Compose 部署，遵循「本地开发与生产并存、日志集中可查」的最佳实践。

## 1. 生产架构总览

```text
浏览器
  │  https://create.yxswy.com  (宿主机 nginx + Let's Encrypt 终止 TLS)
  ▼
宿主机 nginx ───► web (127.0.0.1:5002, nginx 静态 + /api 反代) ──► api (Bun, :5003) ──► postgres
  │                  ▲                                             ▲
  │                  └──────── backend 网（不暴露公网）─────────────┘
  │  https://logs.yxswy.com  (basic_auth)
  ▼
Grafana (127.0.0.1:5300) ◄── Loki ◄── Alloy ◄── docker.sock 采集 api/worker/web 日志
```

- **HTTPS 边缘 = 宿主机 nginx**（与 dev/lunar/p2p 等子域名同一套运维 + certbot）。容器只
  绑定 `127.0.0.1`，由宿主机 nginx 反代；应用容器不打公网端口。
- **日志链**：应用输出 JSON-lines 到 stdout → Alloy 过滤推 Loki → Grafana 查询
  （观测栈在 `observability` profile，核心上线后再启用）。
- **数据**：postgres 命名卷持久化；每日 pg_dump 备份；Loki/Grafana 各自命名卷。
- 关键配置来源：
  - `infra/docker/docker-compose.prod.yml` 生产编排（核心 = postgres/migrate/api/worker/web/backup；观测 = loki/alloy/grafana）
  - `infra/nginx/create.yxswy.com.conf`、`infra/nginx/logs.yxswy.com.conf` 宿主机 nginx 站点模板
  - `infra/scripts/setup-host-edge.sh` 宿主机边缘接入（证书 + conf.d，幂等）
  - `infra/loki/loki.yaml`、`infra/alloy/config.alloy`、`infra/grafana/provisioning/` 日志栈
  - `infra/env/.env.production`（应用机密）、`infra/env/.env.prod-infra`（基础设施变量）——均 gitignored

## 2. 服务器首次初始化

1. 安装 Docker + Compose v2：
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER" && newgrp docker
   docker compose version
   ```
2. 域名 DNS：把 `create.yxswy.com` 与 `logs.yxswy.com` 的 A 记录指向服务器公网 IP。
3. 放行防火墙 80/443（Let's Encrypt 签发与访问需要）。
4. 本地配置 `infra/env/.env.production` 与 `infra/env/.env.prod-infra`（复制对应 `.example` 填写）：
   ```bash
   cp infra/env/.env.production.example infra/env/.env.production
   cp infra/env/.env.prod-infra.example infra/env/.env.prod-infra
   ```
   - `LE_EMAIL` 填你的邮箱（Let's Encrypt 证书通知用）。
   - `POSTGRES_PASSWORD` 必须与 `.env.production` 的 `DATABASE_URL` 内嵌密码一致。
   - `logs.yxswy.com` 入口的 basic_auth 密码 = `GRAFANA_ADMIN_PASSWORD`（边缘接入时服务器自动生成 apr1 htpasswd）。
   - 两个文件都会被 gitignore（已在 .gitignore 中，勿修改）。
5. 本机生成 SSH key 并配置免密登录（或用 `DEPLOY_SSH_KEY` 指向私钥）。

## 3. 部署

一键部署（本地执行，需先 `pnpm run verify` 全绿）：

```bash
pnpm run deploy:prod
```

脚本流程（`infra/scripts/deploy-prod.sh`）：
1. 预检：干净工作区、`check:production-env`（应用）+ `check:production-env infra`（基础设施），并自动把当前 commit SHA 写入两个 env 的 `BAILIAN_STUDIO_RELEASE_TAG`。
2. 本机构镜像（`bailian-studio-runtime:<sha>` / `bailian-studio-web:<sha>`，不可变 tag）。
3. `docker save` → rsync 镜像与全部配置到服务器（env 文件服务器侧 `chmod 600`）。
4. 服务器 `docker load` → `compose pull` 基础镜像 → `run --rm migrate` → `up -d --no-build --pull never`。
5. 冒烟：等待 api 容器 healthy + 宿主机 nginx 边缘就绪（`setup-host-edge.sh` 已签发
   create/logs 证书并 reload）+ 公网 `https://<SITE_DOMAIN>/api/health/ready` 返回 ok。

首次部署注意事项：
- 边缘证书由 `setup-host-edge.sh` 用 certbot webroot 签发（需 80/443 可达、两个域名
  DNS 指向服务器）；该脚本幂等，已存在证书会跳过。
- **观测栈默认不启动**（`observability` profile）。核心上线稳定后再：
  ```bash
  pnpm run prod:observability:up   # 启用 loki/alloy/grafana
  ```
- 之后增量部署每次都是「重新 load 新 SHA 镜像 → 迁移 → 滚动 up → 边缘幂等刷新」。

服务器上手动操作（一般不需要，脚本已覆盖）：
```bash
pnpm run prod:ps       # 查看全栈状态
pnpm run prod:logs     # 跟随后端全量日志
pnpm run logs:api      # 只看 api
pnpm run logs:worker   # 只看 worker
pnpm run prod:down     # 停止（数据保留在命名卷）
```

## 4. 回滚

镜像按 SHA 不可变保存，滚动部署为「先停旧后起新」（非零停机，个人部署可接受）。

```bash
# 一键回滚到服务器上已有的旧镜像（P0-08）：确认镜像存在 → 把
# BAILIAN_STUDIO_RELEASE_TAG 写回旧 SHA → 同步 env → 服务器 up -d --no-build。
# 不重传镜像、不重跑迁移。
pnpm run deploy:rollback <旧SHA>          # 例如 pnpm run deploy:rollback $(git rev-parse HEAD~1)
```

若旧 SHA 镜像不在服务器上（从未全量部署过），回滚脚本会中止并提示改用重新部署：

```bash
git checkout <old-sha>                     # 切到旧版本 commit
pnpm run deploy:prod                       # 会先在干净工作区强制跑 verify 门禁
```

> `docker image prune -f` 只清理无 tag 悬空镜像；带 SHA tag 的旧镜像会保留，便于快速回滚。

## 5. 查看生产日志

### 5.1 Grafana（推荐）

1. 打开 `https://logs.yxswy.com`（宿主机 nginx basic_auth），用 `GRAFANA_ADMIN_USER/PASSWORD` 登录。
2. 三个预置仪表盘（`Bailian Studio` 文件夹）：
   - **日志浏览器**：按 level/scope 过滤的全量日志流 + 日志量时序。
   - **错误面板**：`request.failed by errorCode`、`task.threw`、`task.outcome by outcome`、全部 error 日志。
   - **链路查询**：粘贴 `traceId` / `taskId` / `recordId` 任意一个，跨 api+worker 拉全链路。

### 5.2 常用 LogQL

```logql
# 全部日志（prod 栈）
{compose_project="bailian-studio-prod"}

# 只看 error 且带结构化字段
{compose_project="bailian-studio-prod"} | json | level="error"

# 按请求失败错误码统计
sum by (errorCode) (count_over_time({compose_project="bailian-studio-prod"} | json | msg="request.failed" [$__auto]))

# 按 traceId 跨服务拉一条请求链路
{compose_project="bailian-studio-prod"} | json | traceId="<traceId>"

# 按 taskId 看某个任务的执行轨迹
{compose_project="bailian-studio-prod"} | json | taskId="<taskId>"
```

### 5.3 CLI 直接看

```bash
pnpm run logs:api        # 实时跟随 api
pnpm run logs:worker
pnpm run prod:logs -- --no-follow   # 一次性全量
```

## 5.5 内存护栏与日志清理（2C2G 服务器）

生产栈在低配单机上运行时，每个容器都设了 `mem_limit` 上限：观测栈（loki 256m /
alloy 128m / grafana 192m）限额更紧，超限只重启自己，**不会拖垮 api/worker 等应用进程**。

当服务器内存吃紧（建议先删除旧日志再考虑升配）：

```bash
pnpm run prod:mem            # 看服务器内存 + 各容器实时占用
pnpm run logs:prune          # 队列化删除 24h 前的日志（安全阀）
CUTOFF_HOURS=48 pnpm run logs:prune   # 自定义保留窗口
```

删除由 Loki compactor 在下次压缩（约 10 分钟内）真正应用；`loki.yaml` 已开启
`deletion_mode: filter-and-delete`。日志默认保留 31 天，磁盘吃紧时用 `logs:prune`
主动缩短。

## 6. 备份与恢复

- **自动备份**：`backup` 容器每 24h 执行 `infra/scripts/backup-postgres.sh`，`pg_dump | gzip` 写入 `backups` 命名卷（保留 `BACKUP_RETENTION_DAYS` 天）。备份文件带 UTC 时间戳。
- **手动触发**：`pnpm run db:backup:production`。
- **查看备份**：`docker compose ... exec backup ls -lh /backups`。
- **OSS 灾备（强制二选一，P0-07）**：deploy 预检（`check-production-env infra`）要求显式选择——
  - `BACKUP_OSS_UPLOAD=true`：服务器装有 `ossutil`/`aliyun` CLI 时自动上传；ACCESS_KEY 由服务器环境配置，不进脚本。**上传失败会让备份任务以非零退出**（compose 循环 5 分钟后重试），日志里 `[backup] OSS 上传失败` 即为标红信号。
  - `BACKUP_OSS_UPLOAD=false` + `BACKUP_OSS_DISABLED_ACK=confirmed`：显式接受「备份与 DB 同宿主，整机故障即丢数据」的风险。
  - 缺省/非法值会让 `deploy:prod` 预检直接失败。
- **恢复**（先停止写入方，一般停 api/worker）：
  ```bash
  gunzip -c <backup.sql.gz> | psql "$DATABASE_URL"
  # 然后 pnpm run prod:up
  ```

## 7. 本地开发与生产并存

- **本地 dev**：`pnpm run db:up`（Postgres :55431 + Mailpit :11025）+ `pnpm run dev`（turbo 并行 api/worker/web），端口/库/卷与生产完全隔离。
- **本地生产形态演练**：`pnpm run deploy:rehearsal:up`（:5013 api / :5012 web，一次性迁移 + 可丢弃数据），`deploy:rehearsal:smoke` 做全量自动检查（含 JSON 日志断言）。
- 生产与本地互不干扰：不同 compose 项目名、不同端口、不同数据卷；本地 `.env` 与 `.env.production` 是两份独立文件。

## 8. 故障排查

| 症状 | 排查路径 |
|---|---|
| 公网打不开 / 证书失败 | 检查 80/443 是否开放、DNS A 记录是否指向服务器、宿主机 nginx 日志（`journalctl -u nginx` / `/var/log/nginx/error.log`）与 certbot 证书是否有效 |
| `logs.yxswy.com` 401 | 服务器 `/etc/nginx/htpasswd.bailian-logs` 是否由 `setup-host-edge.sh` 用 `GRAFANA_ADMIN_PASSWORD` 生成 apr1 htpasswd、用户名是否 `GRAFANA_ADMIN_USER`（默认 `viewer`）；改密后重新跑 `deploy:prod`（边缘脚本幂等重建） |
| Grafana 打不开/白屏 | `GF_SERVER_ROOT_URL` 是否为 `https://<LOGS_DOMAIN>`；`logs grafana` |
| Loki 里没有日志 | `logs alloy`（docker.sock 权限、positions 卷）；`logs loki`（receiving 错误）；Grafana datasource `url: http://loki:3100` |
| 限流/审计按 IP 错乱 | 检查 宿主机 nginx → web nginx → api 的 XFF 链：每层用 `$proxy_add_x_forwarded_for` 追加、`API_TRUST_PROXY=true`（API 取首项=真实 IP） |
| worker 不消费队列 | `logs worker`、`/api/health/ready` 的 worker 字段、数据库连接 |
| 用户报 `Failed to fetch dynamically imported module: …/assets/*-<hash>.js` 且刷新没用 | 部署后旧 chunk 被删、客户端仍引用旧 shell（见 04 §7.G）。**先确认线上头**：`curl -sI https://create.yxswy.com/` 的 index.html 应为 `no-cache`。客户端自愈已内置（`vite:preloadError`/动态 import 失败 → 守卫式 reload 一次）；受影响用户硬刷新（Cmd/Ctrl+Shift+R）或清缓存即可 |
| 迁移失败 | `logs migrate`；`run --rm migrate` 手动重跑（幂等） |
| 卷权限（loki/grafana） | 首次挂载若报权限，用一次性 `user: root` init 修正属主后重启 |

## 9. 安全基线

- 两个 env 文件（`.env.production` / `.env.prod-infra`）**gitignored**，服务器侧 `chmod 600`；脚本不打印任何凭据值。
- `check:production-env` 发布前强制：HTTPS origin、`COOKIE_SECURE`/`CSRF_REQUIRE_ORIGIN`/`API_RATE_LIMIT_ENABLED`/`API_TRUST_PROXY=true`、非占位 SMTP/OSS、SHA tag、干净工作区。
- 宿主机 nginx 是唯一 TLS 入口，X-Forwarded-For 用 `$proxy_add_x_forwarded_for` 逐层追加，API 取首项（真实客户端 IP）做限流身份——客户端无法伪造。
- Grafana：关闭匿名访问与自助注册、挂 basic_auth 子域名、日志保留 31 天。
- 应用日志脱敏：`logger` 对 prompt/body/authorization/token 等 key 一律输出 `[Redacted]`。

## 10. 相关命令速查

```bash
pnpm run verify                    # 发布前完整门禁
pnpm run check:production-env      # 应用 env 预检（需 --env-file）
pnpm run check:production-env:infra
pnpm run deploy:prod               # 一键发布（核心栈 + 宿主机 nginx 边缘）
pnpm run deploy:prod:web           # web-only 快速发版（约 20MB，不动 api/worker）
pnpm run db:seed:model-costs       # 播种 model_costs 默认成本（新库首次部署后执行）
pnpm run prod:up|down|ps|logs      # 生产核心栈运维
pnpm run prod:observability:up|down  # 启用/停用日志观测栈（loki/alloy/grafana）
pnpm run logs:api|worker           # 生产单服务日志
pnpm run logs:prune                # 清理旧日志（观测栈启用时）
pnpm run prod:mem                  # 服务器内存 + 容器占用
pnpm run db:backup:production      # 手动备份
pnpm run deploy:rehearsal:up|smoke # 本地生产形态演练
```
