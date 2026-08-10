# Infrastructure

仓库级运行基础设施统一放在这里，所有命令仍从仓库根目录执行：

- `env/`：环境变量模板，以及本地未提交的 `.env`（dev）、`.env.test`、`.env.production`（生产应用机密）、`.env.prod-infra`（生产基础设施变量）。
- `docker/`：Dockerfile 与 Compose 文件。Compose 的 build context 仍是仓库根目录，因此路径使用 `../..`。
- `nginx/`：生产 Web 容器使用的静态文件与反向代理配置（供 Dockerfile `web` target 烘焙）。
- `loki/`、`alloy/`、`grafana/`：生产日志栈配置（Loki 存储、Grafana Alloy 采集、Grafana provisioning 数据源与仪表盘）。
- `scripts/`：数据库、边界检查、生产预检、部署/备份与发布辅助脚本。
- `docker/docker-compose.rehearsal.yml`：本地生产形态演练栈，包含一次性迁移 job、
  API、Worker、Postgres 和 Nginx Web；只使用临时本地存储，不代表公网部署配置。

常用入口保持不变，例如 `pnpm run dev`、`pnpm run verify`、`pnpm run db:up`；根
`package.json` 负责把它们映射到这里的实际文件。Docker 的 `.dockerignore` 特意保留在
仓库根目录，因为 Docker 只会自动读取 build context 根下的忽略文件。

## 本地开发

```bash
cp infra/env/.env.example infra/env/.env
cp infra/env/.env.test.example infra/env/.env.test
pnpm run db:up        # dev Postgres :55431 + Mailpit :11025
pnpm run dev          # turbo 并行：api(bun,5003) / worker(tsx) / web(vite,5002)
```

Windows PowerShell 使用：

```powershell
Copy-Item infra/env/.env.example infra/env/.env
Copy-Item infra/env/.env.test.example infra/env/.env.test
pnpm run db:up
pnpm run dev
```

开发 Postgres 使用 named volume，普通 `pnpm run db:down` 不会删除数据；需要清空
开发库时再执行 `docker compose -f infra/docker/docker-compose.yml down -v`。

本地 rehearsal 在 Windows 上先准备 Linux 静态媒体工具：

```powershell
pnpm run fetch:static-ffmpeg:windows
pnpm run deploy:rehearsal:up
```

生产 `deploy:*` 和观测/备份 Bash 脚本面向 Linux/WSL 服务器，不属于普通 PowerShell
本地命令；Windows 开发验证与生产发布边界保持分离。

## 生产部署

生产编排为单机 Docker Compose，HTTPS 由**宿主机 nginx** 终止（与 dev/lunar/p2p 等
子域名同一套 certbot 运维），完整手册见 `docs/03-ops.md`。

1. 复制并填写两个 gitignored env：
   ```bash
   cp infra/env/.env.production.example infra/env/.env.production
   cp infra/env/.env.prod-infra.example infra/env/.env.prod-infra
   ```
   `LE_EMAIL` 填证书通知邮箱；`logs.yxswy.com` 的 basic_auth 密码 = `GRAFANA_ADMIN_PASSWORD`。
2. 预检：
   ```bash
   pnpm run check:production-env       # 应用 env（需 --env-file infra/env/.env.production）
   pnpm run check:production-env:infra
   ```
3. 一键发布（构建 SHA 镜像 → rsync → 迁移 → 滚动 up → 宿主机 nginx 边缘接入 → 冒烟）：
   ```bash
   pnpm run verify && pnpm run deploy:prod
   ```

生产日志查看：`https://logs.yxswy.com`（Grafana，见 `docs/03-ops.md` 第 5 节）。
观测栈（loki/alloy/grafana）默认不启动，核心稳定后 `pnpm run prod:observability:up` 启用。

## 本地生产形态演练

```bash
pnpm run deploy:rehearsal:up
pnpm run deploy:rehearsal:ps
# Web: http://localhost:5012  API: http://localhost:5013
pnpm run deploy:rehearsal:down
```

要执行完整的自动化启动、健康、队列、JSON 日志格式、重启恢复和清理检查，使用：

```bash
pnpm run deploy:rehearsal:smoke
```

已构建镜像时可使用 `pnpm run deploy:rehearsal:smoke -- --no-build` 加快重复演练；`--keep` 可在检查结束后保留容器以便排查。

演练栈中的 `migrate` 服务使用已提交的 Drizzle migrations，API/Worker 只有在
迁移成功后才会启动；`api/health/ready` 还会检查数据库、存储和 Worker 心跳。

使用 `--profile ops` 可以启动同一份 rehearsal 镜像中的只读运营探针：

```bash
docker compose --profile ops -f infra/docker/docker-compose.rehearsal.yml run --rm ops-health
```

该探针会检查队列积压、outbox 延迟、积分对账偏差、stale reservation、billing anomaly 和 artifact 持久化失败；它不会执行清理、退款或任何写操作。
