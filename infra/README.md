# Infrastructure

仓库级运行基础设施统一放在这里，所有命令仍从仓库根目录执行：

- `env/`：环境变量模板，以及本地未提交的 `.env`、`.env.test`、`.env.production`。
- `docker/`：Dockerfile 与 Compose 文件。Compose 的 build context 仍是仓库根目录，因此路径使用 `../..`。
- `nginx/`：生产 Vue Web 容器使用的静态文件与反向代理配置。
- `scripts/`：数据库、边界检查、生产预检和发布辅助脚本。
- `docker/docker-compose.rehearsal.yml`：本地生产形态演练栈，包含一次性迁移 job、
  API、Worker、Postgres 和 Nginx Web；只使用临时本地存储，不代表公网部署配置。

常用入口保持不变，例如 `bun run dev`、`bun run verify`、`bun run db:up`；根
`package.json` 负责把它们映射到这里的实际文件。Docker 的 `.dockerignore` 特意保留在
仓库根目录，因为 Docker 只会自动读取 build context 根下的忽略文件。

生产 Docker `web` target 只构建 `@bailian-studio/web`（合并后的 React 前端）并把
`apps/web/dist` 复制到 Nginx。
Vue 的隔离浏览器验收入口是 `bun run e2e:vue`。

首次本地配置：

```bash
cp infra/env/.env.example infra/env/.env
cp infra/env/.env.test.example infra/env/.env.test
```

生产环境应复制 `infra/env/.env.production.example` 为
`infra/env/.env.production`，并在启动前运行
`bun --env-file=infra/env/.env.production run check:production-env`。

本地部署演练：

```bash
bun run deploy:rehearsal:up
bun run deploy:rehearsal:ps
# Web: http://localhost:5012  API: http://localhost:5013
bun run deploy:rehearsal:down
```

要执行完整的自动化启动、健康、队列、重启恢复和清理检查，使用：

```bash
bun run deploy:rehearsal:smoke
```

已构建镜像时可使用 `bun run deploy:rehearsal:smoke -- --no-build` 加快重复演练；`--keep` 可在检查结束后保留容器以便排查。

演练栈中的 `migrate` 服务使用已提交的 Drizzle migrations，API/Worker 只有在
迁移成功后才会启动；`api/health/ready` 还会检查数据库、存储和 Worker 心跳。

使用 `--profile ops` 可以启动同一份 rehearsal 镜像中的只读运营探针：

```bash
docker compose --profile ops -f infra/docker/docker-compose.rehearsal.yml run --rm ops-health
```

该探针会检查队列积压、outbox 延迟、积分对账偏差、stale reservation、billing anomaly 和 artifact 持久化失败；它不会执行清理、退款或任何写操作。
