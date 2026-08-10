# 生产部署手册（04-deployment-playbook）

> **给未来会话/协作者的起点**：任何涉及生产部署的工作，先读本手册 + `docs/03-ops.md`。
> 本手册沉淀自 2026-08-05 首次生产部署的**踩坑实录**——当时反复碰壁才摸清环境。
> 照着下面的"正确流程"走，一次通过；遇到问题先查第 7 节"踩坑清单"。

---

## 1. 必须先知道的环境事实（部署前勿改）

| 事实 | 说明 |
|---|---|
| 服务器 = **共享机** | `root@101.35.246.159`（SSH 别名 `yxswy-server`，见 `~/.ssh/config`）。同一台机器还跑着 p2p-transmission、webrtc-camera-share、digital-companion、lunar-oracle-postgres、mihomo 等约 9 个容器 + 宿主机 nginx。**不是 bailian-studio 专用机**。 |
| **HTTPS 边缘 = 宿主机 nginx + certbot** | 80/443 被宿主机 nginx 独占。**不要部署 Caddy**（本仓库曾内置 Caddy，已因此移除）。create/logs.yxswy.com 通过 `/etc/nginx/conf.d/*.conf` 反代到 `127.0.0.1:5002`（web）/ `127.0.0.1:5300`（grafana）。 |
| 服务器 **2C2G** | 内存 1.9G，可用约 1G + 2G swap。所有容器都设了 `mem_limit`；观测栈（loki 256m/alloy 128m/grafana 192m）限额更紧，超限只重启自己。 |
| 服务器 **x86_64**、本机 **arm64** | 本机构镜像必须 `--platform linux/amd64`（deploy 脚本已处理，`DEPLOY_PLATFORM=linux/amd64`）。Dockerfile 用 `TARGETARCH` 自动分架构。 |
| 本机 **Clash fake-ip 劫持 DNS** | 本地 `dig`/`curl` 看到的域名 IP 是 `198.18.0.x`（假）。**查 DNS 必须在服务器上**：`ssh yxswy-server 'getent hosts create.yxswy.com'` 应返回 `101.35.246.159`。 |
| **证书是 SAN 多域名** | certbot 一次为 create + logs 签发一份证书，只存在 `/etc/letsencrypt/live/create.yxswy.com/`。**logs 站点也要引用 create 的证书路径**，不存在 `live/logs.yxswy.com/`。 |
| 运行时用户是 **bun** | 生产镜像以 `bun` 用户运行（Dockerfile 末尾 `USER bun`）。无 `node` 用户。 |
| Node 必须 ≥24 | 镜像内是官方二进制 Node 24（apt 的 nodejs 是 v20，会让 worker 因缺 `import.meta.main` 静默退出 0）。 |

---

## 2. 正确的一键部署流程

### 2.1 前置条件（一次性）

```bash
# 1) 两个 gitignored env 已填真实值
cp infra/env/.env.production.example infra/env/.env.production
cp infra/env/.env.prod-infra.example infra/env/.env.prod-infra
#    - .env.production 的 DATABASE_URL 内嵌密码必须与 .env.prod-infra 的 POSTGRES_PASSWORD 一致
#    - .env.prod-infra 填 LE_EMAIL、GRAFANA_ADMIN_USER/PASSWORD、DEPLOY_HOST=yxswy-server
#    - 服务器上的 .env 文件权限已被部署脚本 chmod 600

# 2) 预检（两个都要过）
pnpm run check:production-env            # 应用 env（脚本内部会加载 .env.production）
pnpm run check:production-env:infra      # 基础设施 env（.env.prod-infra）

# 3) SSH 通 + DNS 对（在服务器上查，别在本地查）
ssh yxswy-server 'docker --version && getent hosts create.yxswy.com'
#    应输出 Docker 版本 + "101.35.246.159 create.yxswy.com"

# 4) 工作区干净
git status --porcelain   # 必须无输出

# 5) 宿主机静态 ffmpeg/ffprobe 已就绪（runtime 镜像不再打包它们）
#    在服务器上执行（见 infra/scripts/fetch-static-ffmpeg.sh）：
#    ssh yxswy-server 'bash /opt/bailian-studio/scripts/fetch-static-ffmpeg.sh'
#    → 产物 /opt/bailian-studio/ffmpeg/{ffmpeg,ffprobe}（自包含静态二进制）
#    deploy:prod 会预检这两文件存在，缺失则拒绝部署。
```

> **部署路径怎么选（省带宽的关键）**：
>
> | 改动范围 | 命令 | 传输 |
> |---|---|---|
> | **只改前端**（apps/web、apps/admin） | `pnpm run deploy:prod:web` | ~20MB，不动 api/worker/runtime |
> | **改了后端 / 前后端同改 / 改了 DB schema** | `pnpm run verify && pnpm run deploy:prod` | 全量（runtime 镜像，瘦身后 ~240MB） |
>
> `deploy:prod` 现在会在「上一次提交只改前端」时打印 web-only 提示（非阻断）。日常前端热修
> 一律走 web-only，只有后端变更才全量重传 runtime 镜像。

### Windows 开发与生产发布边界

Windows PowerShell 支持本地安装、dev/test 数据库、typecheck、测试和 rehearsal。
rehearsal 使用 Linux 容器，首次运行前执行：

```powershell
pnpm run fetch:static-ffmpeg:windows
pnpm run deploy:rehearsal:up
```

`deploy:prod`、`deploy:prod:web`、备份、回滚和观测脚本依赖 Bash、rsync、awk 及
Linux 远程命令，必须在 Linux/WSL 或 Linux CI 执行；不要在普通 Windows PowerShell
中直接执行生产发布脚本。

### 2.2 一键发布

```bash
pnpm run verify && pnpm run deploy:prod
```

`deploy:prod` 内部流程（了解它才能排查）：
1. **预检**：干净工作区 + `check:production-env`（应用）+ `check:production-env:infra`，并把当前 commit SHA 写入两个 env 的 `BAILIAN_STUDIO_RELEASE_TAG`。
2. **本机构镜像**：`docker build --platform linux/amd64`（runtime + web，tag = commit SHA）。
3. **传输**：`docker save` → rsync 到 `/opt/bailian-studio/` → 服务器 `docker load`。
4. **拉核心基础镜像**：`docker compose pull postgres`（观测栈镜像另行拉）。
5. **迁移**：`docker compose run --rm migrate`（drizzle-kit，幂等）。
6. **启动核心栈**：`docker compose up -d`（postgres/migrate/api/worker/web/backup；观测栈在 `observability` profile，默认不启）。
7. **宿主机边缘接入**：`setup-host-edge.sh`（幂等：写 HTTP-only conf.d → certbot webroot 签发 → 写完整 conf.d → reload）。
8. **冒烟**：等 api healthy + 公网 `https://create.yxswy.com/api/health/ready` 返回 `status: ok`。

### 2.3 部署后验证（都应通过）

除健康检查外，`deploy:prod` 会校验公网 API 返回的完整 `BAILIAN_STUDIO_RELEASE_TAG`，并校验公网首页实际加载的 `index` bundle 是否来自本次构建的 web 镜像。`deploy:prod:web` 只执行后者；任一版本不一致都会让部署失败，避免健康但旧版本继续对外服务。

```bash
# 在服务器上
docker ps --format '{{.Names}} {{.Status}}' | grep bailian
#    web Up / api Up (healthy) / worker Up / postgres Up (healthy) / backup Up

# 从本机（用 --resolve 绕过本地 fake-ip DNS）
curl -sS --resolve create.yxswy.com:443:101.35.246.159 https://create.yxswy.com/api/health/ready
#    {"success":true,"data":{"status":"ok","checks":{"database":"ok","storage":"ok","worker":"ok"}}}
curl -sS -o /dev/null -w "%{http_code}\n" --resolve logs.yxswy.com:443:101.35.246.159 https://logs.yxswy.com/
#    401（basic_auth 保护，正确）
```

**首次部署 / 新库（或 model_costs 表为空）时，追加一次性播种模型成本**（幂等，`on conflict do nothing`，不会覆盖 admin 已调成本）：

```bash
docker compose --env-file /opt/bailian-studio/infra/env/.env.prod-infra \
  -f /opt/bailian-studio/infra/docker/docker-compose.prod.yml \
  run --rm migrate pnpm exec tsx infra/scripts/seed-model-costs.ts
#   输出：Seeded N model cost rows.（admin「分析 → 维护模型成本」可再调）
```

---

## 3. 分步手动流程（一键失败时用）

镜像已构建/已传输时，可在服务器上分步执行（`COMPOSE` 定义见下）：

```bash
# 在服务器上（/opt/bailian-studio 下）
COMPOSE="docker compose --env-file /opt/bailian-studio/infra/env/.env.prod-infra -f /opt/bailian-studio/infra/docker/docker-compose.prod.yml"

$COMPOSE pull postgres            # 核心基础镜像（观测栈启用时另 pull loki alloy grafana）
$COMPOSE run --rm migrate         # 迁移（幂等）
$COMPOSE up -d --no-build --pull never   # 启动核心栈
bash /opt/bailian-studio/infra/scripts/setup-host-edge.sh /opt/bailian-studio/infra  # 边缘（幂等）
$COMPOSE ps                       # 看状态
$COMPOSE logs api --tail 50       # 看日志
```

---

## 4. 增量发版

改代码 → `pnpm run verify` → `pnpm run deploy:prod`。每次按**新 commit SHA** 重建镜像（层缓存让构建很快），迁移幂等，边缘脚本幂等。

> **成本提示**：`deploy:prod` 会把 runtime 镜像（生产依赖 `pnpm install --prod` 后
> ~380MB；2026-08 起 ffmpeg/ffprobe 改为宿主机静态挂载，进一步瘦到 ~240MB）一起重传，
> 即使只改了前端。前端热修用下面的 web-only 路径省带宽、且不动 api/worker。
>
> **ffmpeg 挂载架构（2026-08 起）**：runtime 镜像不再打包 ffmpeg/ffprobe，api（上传媒体时长
> 探测）与 worker（音频提取/缩略图）通过 compose 的 `x-ffmpeg-mounts`（`FFMPEG_HOST_DIR`
> 可覆盖，默认 `/opt/bailian-studio/ffmpeg`）bind-mount 宿主机**静态** ffmpeg/ffprobe。
> 静态版自包含、无共享库依赖，才能跨发行版（宿主机 OpenCloudOS/rpm → 容器 Debian）挂载。
> 宿主机二进制缺失时 `deploy:prod` 预检直接拒绝（不会部署出媒体功能挂掉的 worker）。

### 4.1 web-only 快速发版（只改前端时用，传输 ~20MB、不动 api/worker）

> 已有脚本封装 `pnpm run deploy:prod:web`（`infra/scripts/deploy-prod-web.sh`，含工作区
> 预检/镜像构建/rsync/服务器 load/仅重建 web 容器，行为与下方手抄命令等价）。以下为
> 手抄路径（脚本不可用或想逐步入肉时参考）：

```bash
NEWSHA=$(git rev-parse HEAD)
docker build --platform linux/amd64 -f infra/docker/Dockerfile --target web \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$NEWSHA" \
  --build-arg VITE_API_ORIGIN= --build-arg VITE_WEB_ORIGIN="https://create.yxswy.com" \
  -t "bailian-studio-web:$NEWSHA" .
docker save -o "web-$NEWSHA.tar" "bailian-studio-web:$NEWSHA"
rsync -az "web-$NEWSHA.tar" yxswy-server:/opt/bailian-studio/
ssh yxswy-server "docker load -i /opt/bailian-studio/web-$NEWSHA.tar && rm -f /opt/bailian-studio/web-$NEWSHA.tar && BAILIAN_STUDIO_RELEASE_TAG=$NEWSHA docker compose --env-file /opt/bailian-studio/infra/env/.env.prod-infra -f /opt/bailian-studio/infra/docker/docker-compose.prod.yml up -d --no-deps web"
```

> 注意：这只把 web 容器切到新 SHA，`BAILIAN_STUDIO_RELEASE_TAG` 仍是旧 SHA（api/worker
> 保持运行旧镜像）。验证用 Vite 内容指纹：`curl` 线上首页提取 `/assets/index-*.js`，
> 与本地 `apps/web/dist/assets/` 同名文件字节数一致即已生效（压缩后别 grep 组件名）。

---

## 5. 启用 / 停用观测栈（先核心后观测）

观测栈（loki/alloy/grafana）在 `observability` profile，核心稳定后再启用：

```bash
pnpm run prod:observability:up     # 启用 loki/alloy/grafana
pnpm run prod:observability:down   # 停用
pnpm run logs:prune                # 内存/磁盘吃紧时删除 24h 前旧日志（需 loki 已启）
pnpm run prod:mem                  # 看服务器内存 + 容器占用
```

启用后 `https://logs.yxswy.com`（basic_auth 密码 = `GRAFANA_ADMIN_PASSWORD`）进入 Grafana，
3 个预置仪表盘可查日志（日志浏览器 / 错误面板 / 按 traceId/taskId/recordId 拉链路）。

---

## 6. 回滚

镜像按 SHA 不可变，旧 SHA 镜像保留在服务器 docker 里（`image prune -f` 只清无 tag 的）：

```bash
git checkout <旧SHA>      # 切回旧版本
pnpm run deploy:prod      # 会用旧 SHA 重新构建/传输/部署
# 或只切镜像 tag：把 .env.prod-infra 的 BAILIAN_STUDIO_RELEASE_TAG 改成旧 SHA 后 pnpm run prod:up
```

---

## 7. 踩坑清单（本会话实录：症状 → 根因 → 规避）

> 这些都是本次实际撞过的墙。新会话遇到同类报错，直接对照这里。

### A. 架构与运行时
1. **`node: no such file /lib64/ld-linux-x86-64.so.2` / exit 133**
   → 本机 arm64 上拉了 x64 Node 二进制。规避：Dockerfile 用 `TARGETARCH` 分支；构建用 `--platform linux/amd64`。
2. **Worker 启动即退出 0、无日志、`/api/health/ready` 的 worker 一直 failed**
   → 镜像里 Node 是 v20（apt nodejs），没有 `import.meta.main`，worker 的 `main()` 永不执行。规避：Dockerfile 用官方二进制 Node ≥24（已改）。
3. **`chown: invalid user: 'node:node'`（rehearsal artifact-init）**
   → 运行时镜像只有 `bun` 用户。规避：改为 `chown -R bun:bun`。
4. **rehearsal 起不来但本机 `pnpm run dev` 正常**
   → 是镜像/容器环境问题，不是代码问题。先 `docker compose -f .../rehearsal.yml run --rm <svc>` 单独跑该服务看真实报错。

### B. bash 脚本（deploy/setup/backup 一律注意）
5. **`$VAR: unbound variable`，且 `$VAR` 后面是中文全角括号（`$VAR（`）**
   → UTF-8 下 bash 把全角 `（` 并入变量名。规避：**任何 `$VAR` 后紧跟全角字符都要写 `${VAR}`**。
6. **`SSH_ARGS[@]: unbound variable`（macOS bash 3.2）**
   → `set -u` + 空数组展开。规避：不用数组，`if [[ -n "$X" ]]` 分支调用。
7. **`cmd && next` 中 `cmd` 失败但脚本没退出**
   → `set -e` 对 `&&`/`||` 列表首命令豁免。规避：`if ! cmd; then echo ...; exit 1; fi`。
8. **部署失败后工作区出现 `images-*.tar`，下次部署 GIT_WORKTREE 预检失败**
   → docker save 产物没清理。规避：脚本加 `trap 'rm -f "$REPO_ROOT"/images-*.tar' EXIT` + gitignore。

### C. 服务器环境
9. **本地 `dig` 返回 198.18.0.x**
   → Mac 上 Clash fake-ip 劫持 DNS。规避：**DNS 一律在服务器上查**（`getent hosts`）。
10. **Caddy 容器起不来 / 端口冲突**
    → 80/443 被宿主机 nginx 独占。规避：**本仓库不用 Caddy**，接入宿主机 nginx（模板在 `infra/nginx/*.yxswy.com.conf`）。
11. **`nginx -t` 报 `cannot load certificate /etc/letsencrypt/live/logs.yxswy.com/...`**
    → certbot 一次签发的 SAN 证书只存在 `live/create.yxswy.com/`。规避：logs 站点引用 create 的证书路径。
12. **`docker inspect bailian-studio-prod-api` 找不到容器**
    → 容器名带 `-1` 后缀（`bailian-studio-prod-api-1`）。规避：用 `$COMPOSE ps api --format '{{.Status}}'` 解析。
13. **共享机内存吃紧 / 容器被 OOM 杀**
    → 2C2G 还跑着 9 个别的容器。规避：所有容器设 `mem_limit`；观测栈限额更紧；吃紧时 `pnpm run logs:prune`。

### D. 网络
14. **`docker build` 报 `could not fetch content descriptor ... not found`**
    → Docker Hub 瞬时失败（国内网络常见）。规避：**直接重试**，层缓存会生效。
15. **服务器 `compose pull` 很慢**
    → 腾讯云到 Docker Hub 慢。规避：耐心等待；基础镜像拉过一次就常驻。

### E. 本地开发
16. **`pnpm run verify` 大量测试报 `DATABASE_URL is required`**
    → 缺 gitignored 的 `.env.test`。规避：`cp infra/env/.env.test.example infra/env/.env.test`；`db:test:up` 起 test DB。

### F. rsync / 文件传输
17. **`rsync -az infra/nginx/ server:/opt/.../infra/` 后服务器上文件位置不对**
    → 源目录尾斜杠 = 拷"内容"而非"目录本身"。规避：目标路径写全子目录，如 `server:/opt/.../infra/nginx/`。

### G. 前端缓存 / chunk 加载（2026-08-07 事故实录）
18. **用户报 `Failed to fetch dynamically imported module: https://create.yxswy.com/assets/GenerationDetailPage-C1HjH_VR.js`，刷新没用**
    → 懒加载路由 chunk 按内容哈希命名；部署重建后旧 chunk 被**物理删除**（dist 烤进镜像、容器替换即删旧文件，无版本目录/保留方案）。仍持有旧 shell 的客户端（缓存旧 index.html、tab 跨部署未关、bfcache/内存旧模块图）对动态 import 命中 404。应用内「重试」若只 setState 不 reload，会反复重试同一缺失 chunk，观感即「刷新没用」。
    → **根因在客户端恢复缺失，不在缓存头**：线上 index.html 已 `no-cache`（每次加载 revalidate 取新哈希），真正 F5 本应自愈。
    → 规避/已落地：① 客户端守卫式自愈（`vite:preloadError` + 动态 import 失败 → sessionStorage 守卫下 reload 一次，`apps/web/src/lib/chunk-recovery.ts`，admin 同款）；② 错误边界「重试」对 chunk 错误改真 reload；③ 懒路由根布局 `errorElement` 恢复 UI；④ 资产头加 `immutable`、admin HTML 补 `no-cache`（`infra/nginx/bailian-studio.conf`，注意 location 内 add_header 不继承 server 级头、需重复声明）。
    → 排查第一手：`curl -sI https://create.yxswy.com/` 看 index.html 的 Cache-Control；部署后对比 `apps/web/dist/assets/*.js` 与线上哈希。

---

## 8. 未来会话入口速查

- **先读**：`docs/04-deployment-playbook.md`（本手册）+ `docs/03-ops.md`（运维：日志/备份/回滚/故障）。
- **CLAUDE.md** 已在此指向本手册，新会话会自动加载。
- 关键命令：`pnpm run verify && pnpm run deploy:prod`（一键）；`pnpm run prod:observability:up`（开日志）；`pnpm run logs:prune`（清旧日志）。
- 安全红线：两个 `.env*` 生产文件 gitignored，**绝不在日志/命令输出里打印凭据值**；只验证键是否存在。
