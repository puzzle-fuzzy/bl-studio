# 仓库目录规范迁移决策

## 决策

`bl-studio` 从 `infra/` 混合目录迁移到以下唯一现行结构：

```text
.
├── .env.example
├── .env.test.example
├── .env.production.example
├── .env.prod-infra.example
├── data/fixtures/                 # 可提交的种子/测试数据
├── deploy/
│   ├── docker/                    # Dockerfile 与 compose*.yaml
│   ├── nginx/                     # 容器与宿主机 nginx 配置
│   └── observability/             # loki / alloy / grafana
├── playwright.config.ts           # 唯一 Playwright 配置
├── scripts/
│   ├── backup/                    # 备份、恢复辅助与备份环境投影
│   ├── db/                        # 数据库、回填、播种和账号维护
│   ├── deploy/                    # 部署、回滚、队列和生产运维
│   ├── dev/                       # 本地开发辅助（如静态 ffmpeg 下载）
│   ├── docs/                      # 官方文档同步
│   └── verify/                    # CI、边界、清单、发布和工作流门禁
└── tests/e2e/                     # Playwright 测试与历史 legacy-vue 归档
```

真实 `.env` 文件仍只放仓库根目录并由 `.gitignore` 忽略；`var/` 是本地运行时数据目录，静态 ffmpeg/ffprobe 放在 `var/ffmpeg/`，不进入 Git。

## 为什么这样调整

- `infra/` 同时承载环境、Docker、Nginx、监控、脚本和种子数据，职责边界不清，容易出现路径重复或脚本引用失效。
- `deploy/` 只表达部署声明，`scripts/` 按动作分组，根环境文件让 Bun、Node、pnpm、Docker Compose 和 CI 使用同一入口。
- Compose 文件统一使用 `compose.yaml`、`compose.test.yaml`、`compose.rehearsal.yaml`、`compose.prod.yaml`，不再混用 `docker-compose*.yml`。
- Playwright 配置放根目录，测试统一放 `tests/e2e/`；前端默认仍以类型检查、构建和纯函数/component 测试为主，不把页面最终形态测试作为默认门禁。

## 生产远程目录契约

本地仓库迁移后，部署脚本使用：

```text
$DEPLOY_REMOTE_DIR/
├── .env.production
├── .env.prod-infra
├── .env.prod-backup
└── deploy/
    ├── docker/compose.prod.yaml
    ├── nginx/
    ├── observability/{loki,alloy,grafana}/
    └── scripts/{setup-host-edge.sh,fetch-static-ffmpeg.sh,production-monitor.sh,restore-rehearsal.sh}
```

默认 `$DEPLOY_REMOTE_DIR` 仍为 `/opt/bailian-studio`，可由 `.env.prod-infra` 的 `DEPLOY_REMOTE_DIR` 覆盖。仓库已更新本地脚本和文档，但本次迁移没有通过 SSH 连接生产机，也没有运行 `pnpm run deploy:prod`、数据库迁移或远程删除。

## 首次发布前的远程迁移

如果生产机仍只有旧的 `/opt/bailian-studio/infra/`，第一次使用新脚本前必须由运维人员完成一次迁移：

1. 停止并确认当前 Compose 操作窗口，备份旧的 `/opt/bailian-studio/infra/` 目录和三个环境文件；不要把环境文件内容放入日志或提交记录。
2. 创建 `/opt/bailian-studio/deploy/{docker,nginx,observability/{loki,alloy,grafana},scripts}`，并把新版本发布脚本上传到这些目录；把 `.env.production`、`.env.prod-infra`、`.env.prod-backup` 放到 `/opt/bailian-studio/` 根目录。
3. 先执行只读校验：

   ```bash
   docker compose --env-file /opt/bailian-studio/.env.prod-infra \
     -f /opt/bailian-studio/deploy/docker/compose.prod.yaml config
   ```

4. 用一次完整的 `pnpm run deploy:prod` 验证 `migrate`、核心栈、宿主机 nginx 和公网健康检查均通过；在此之前不要删除旧 `infra/` 备份。
5. 新路径运行稳定并完成备份核验后，才可以由运维人员确认并清理远程旧目录；本地仓库不再提供旧 `infra/` 兼容路径。

## 历史文档边界

`docs/superpowers/` 中早期计划可以保留当时的目录作为历史事实，不是当前命令入口。所有现行说明、`CLAUDE.md`、README、CI、Compose、Dockerfile 和脚本必须只引用上面的新结构；新增代码或文档不得恢复 `infra/` 目录。
