# bl-studio Repository Layout Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `bl-studio` 从 `infra/` 混合目录迁移到根目录环境文件、`deploy/` 部署声明、分组后的根目录 `scripts/`、根目录 Playwright 配置和 `tests/e2e/`，并让代码、文档、CI、Docker Compose、生产脚本使用同一套路径。

**Architecture:** `deploy/` 只保存 Docker、Nginx、可观测性和部署相关声明；根目录 `.env*.example` 与被忽略的 `.env*` 作为唯一环境变量入口；`scripts/` 按 db、deploy、docs、verify、backup、dev 分组，脚本深度保持为两层以保留既有仓库根目录计算逻辑。生产机远程目录改为 `$DEPLOY_REMOTE_DIR/deploy`，本次只更新仓库和部署契约，不连接生产机执行发布。

**Tech Stack:** pnpm 10.9、Turbo、Bun 1.3.14、Node 24、Biome、TypeScript/tsx、Vitest、Playwright、Docker Compose。

## Global Constraints

- 保留当前 `pnpm + turbo` 和 API Bun / Worker Node+tsx 的项目约定。
- 环境文件统一在仓库根目录；真实 `.env` 文件不进入 Git，绝不打印其值。
- `deploy/` 是唯一部署声明目录；不保留第二套可运行的 `infra/` 路径。
- 迁移后的脚本必须继续支持 macOS Bash 3.2、Linux CI 和 Windows portability gate。
- 现行代码与规范文档必须在同一组变更中同步；`docs/superpowers/` 中描述历史状态的旧计划保留为历史记录，并在新的决策文档中明确说明。
- 生产部署脚本只做静态路径和配置更新；不执行 `deploy:prod`、SSH、远程删除或生产数据库操作。
- 任何无法确认是否为运行时数据、凭据、备份或用户输入的文件都不删除；只删除迁移后明确失效的目录和受 Git 管理的旧路径。

---

### Task 1: 建立目标目录并搬迁非敏感文件

**Files:**
- Move/rename: `infra/docker/docker-compose.yml` -> `deploy/docker/compose.yaml`, `docker-compose.test.yml` -> `compose.test.yaml`, `docker-compose.rehearsal.yml` -> `compose.rehearsal.yaml`, `docker-compose.prod.yml` -> `compose.prod.yaml`; move the remaining Docker files into `deploy/docker/`
- Move: `infra/nginx/*` -> `deploy/nginx/*`
- Move: `infra/loki/*`, `infra/alloy/*`, `infra/grafana/*` -> `deploy/observability/{loki,alloy,grafana}/*`
- Move: `infra/seed/model-costs.json` -> `data/fixtures/model-costs.json`
- Move: `infra/scripts/*` -> `scripts/{db,deploy,docs,verify,backup,dev}/*` according to script responsibility
- Move: `e2e/playwright.config.ts` -> `playwright.config.ts`
- Move: `e2e/asset-loop.spec.ts`, `e2e/legacy-vue/*` -> `tests/e2e/`
- Modify: `.gitignore`

**Interfaces:**
- Produces the canonical filesystem layout used by all following tasks.
- Keeps scripts at `scripts/<group>/file`, so `new URL('.', import.meta.url)` plus `../..` still resolves to the repository root.

- [x] **Step 1: Check target conflicts and ignored runtime directories**

Run:

```bash
git status --short --branch
test ! -e deploy && test ! -e scripts && test ! -e data/fixtures && test ! -e playwright.config.ts
```

Expected: clean `main` worktree and no conflicting target paths. If a target exists, stop and inspect it before moving anything.

- [x] **Step 2: Move tracked deployment declarations and tests**

Use `git mv` to preserve history. Put database/backfill/seed/credit scripts in `scripts/db`; deployment/queue/restore/host scripts in `scripts/deploy`; document synchronization and its helper in `scripts/docs`; release, workflow, package/model/boundary and Playwright helpers in `scripts/verify`; backup scripts in `scripts/backup`; static ffmpeg download scripts in `scripts/dev`.

- [x] **Step 3: Move the ignored ffmpeg runtime directory only after validating it is runtime data**

If `infra/ffmpeg` exists and `var/ffmpeg` does not, move it to `var/ffmpeg`; do not inspect or print binary contents. If either condition is false, leave the data in place and report the exception.

- [x] **Step 4: Update ignore rules**

Use these canonical patterns:

```gitignore
.env
.env.*
!.env.example
!.env.test.example
!.env.production.example
!.env.prod-infra.example
!.env.prod-backup.example
var/ffmpeg/
tests/e2e/.playwright/
```

Preserve existing archive, Playwright report, generated asset, and secret ignore rules.

- [x] **Step 5: Run a path inventory**

Run `rg -n "infra/(docker|env|nginx|loki|alloy|grafana|seed|scripts|ffmpeg)|e2e/playwright|e2e/asset-loop|e2e/legacy-vue" --glob '!docs/superpowers/**' .` and save the result mentally for Task 2. Expected: only references that still need code/config/doc updates.

### Task 2: Move environment templates and update script/package entrypoints

**Files:**
- Move: `infra/env/.env.example` -> `.env.example`
- Move: `infra/env/.env.test.example` -> `.env.test.example`
- Move: `infra/env/.env.production.example` -> `.env.production.example`
- Move: `infra/env/.env.prod-infra.example` -> `.env.prod-infra.example`
- Modify: `.gitignore`, `package.json`, `scripts/**`
- Modify: ignored local `.env`, `.env.test`, `.env.production`, `.env.prod-infra` only by moving them to the root; never stage them

**Interfaces:**
- `pnpm run dev`, database commands, workflow commands, queue commands, and production checks all resolve root `.env*` paths.
- `prepare-backup-env.ts` reads root `.env.production` and `.env.prod-infra` and writes root `.env.prod-backup`.

- [x] **Step 1: Confirm root env targets are absent or are the same user-owned files**

List only filenames with `find . -maxdepth 1 -type f -name '.env*' -print`; never print contents. Do not overwrite a root env file without comparing ownership and asking if it is a different file.

- [x] **Step 2: Move templates and local env files**

Use `git mv` for tracked examples. Move ignored local files with `mv` only after the target check. Keep all values unchanged and keep the files untracked.

- [x] **Step 3: Rewrite `package.json` commands**

Use root env names (`.env`, `.env.test`, `.env.production`, `.env.prod-infra`) and the new grouped script paths. The E2E command must call `node scripts/verify/playwright-cli.cjs test --config=playwright.config.ts`; local database Compose commands must use `deploy/docker/compose*.yaml`.

- [x] **Step 4: Update path calculations and backup generation**

Keep `repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')` for scripts directly under `scripts/<group>`. Change `prepareBackupEnvironment` defaults to `resolve(repositoryRoot, '.env.production')`, `resolve(repositoryRoot, '.env.prod-infra')`, and `resolve(repositoryRoot, '.env.prod-backup')`.

- [x] **Step 5: Run script-level static checks**

Run `pnpm exec vitest run scripts/backup/prepare-backup-env.test.ts scripts/verify/check-production-env.test.ts --hookTimeout=30000`. Expected: tests pass without reading real production values.

### Task 3: Update Dockerfiles and Compose declarations

**Files:**
- Modify: `deploy/docker/Dockerfile`
- Modify: `deploy/docker/Dockerfile.backup`
- Modify: `deploy/docker/compose.yaml`
- Modify: `deploy/docker/compose.test.yaml`
- Modify: `deploy/docker/compose.rehearsal.yaml`
- Modify: `deploy/docker/compose.prod.yaml`
- Modify: `.dockerignore` if present

**Interfaces:**
- Docker build context remains repository root.
- Compose production env files are root `.env.production`, `.env.prod-infra`, `.env.prod-backup`.
- Runtime seed source is `data/fixtures/model-costs.json`; host ffmpeg runtime data is `var/ffmpeg` locally and `/opt/bailian-studio/ffmpeg` on production hosts.

- [x] **Step 1: Update Docker build copies**

Replace `COPY infra/scripts` with `COPY scripts`, `COPY infra/seed` with `COPY data/fixtures`, `COPY infra/nginx` with `COPY deploy/nginx`, and backup image sources with `deploy/docker/backup-package.json`, `scripts/backup/backup-postgres.sh`, and `scripts/backup/upload-backup-to-oss.ts`.

- [x] **Step 2: Update Compose relative mounts and comments**

From `deploy/docker/compose.prod.yaml`, use `../observability/loki`, `../observability/alloy`, `../observability/grafana`, and `../scripts/deploy/production-monitor.sh`; use root env files from commands invoked at the repository root. Change queue/rehearsal references to `scripts/deploy/queue-ops.ts` and `var/ffmpeg` where the local runtime directory is referenced.

- [x] **Step 3: Validate Compose interpolation without starting services**

Run `docker compose -f deploy/docker/compose.yaml config`, `docker compose -f deploy/docker/compose.test.yaml config`, `docker compose -f deploy/docker/compose.rehearsal.yaml config`, and `docker compose --env-file .env.prod-infra -f deploy/docker/compose.prod.yaml config` only when the required local env file exists. Expected: valid normalized YAML; no service starts.

### Task 4: Update deployment scripts, CI, and Playwright

**Files:**
- Modify: `scripts/deploy/deploy-prod.sh`
- Modify: `scripts/deploy/deploy-prod-web.sh`
- Modify: `scripts/deploy/deploy-rollback.sh`
- Modify: remaining `scripts/deploy/*.sh`, `scripts/deploy/*.ts`, `scripts/backup/*`, `scripts/verify/*`, `scripts/dev/*`
- Modify: `.github/workflows/ci.yml`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/asset-loop.spec.ts`

**Interfaces:**
- New remote deployment layout is `$DEPLOY_REMOTE_DIR/deploy/{docker,nginx,observability}` and `$DEPLOY_REMOTE_DIR/.env.production`, `.env.prod-infra`, `.env.prod-backup`.
- `$DEPLOY_REMOTE_DIR` itself remains configurable; the default remains `/opt/bailian-studio`.
- `playwright.config.ts` is the only Playwright config, with `testDir: 'tests/e2e'` and web servers launched from the repository root.

- [x] **Step 1: Update local paths and safety messages in deploy scripts**

Use root `.env*`, `deploy/docker/Dockerfile*`, `deploy/docker/compose.prod.yaml`, `scripts/deploy/*`, `scripts/verify/*`, and `scripts/dev/fetch-static-ffmpeg.sh`. Preserve the existing clean-worktree, no-secret-output, image-tar cleanup, verify gate, and SSH key resolution behavior.

- [x] **Step 2: Change the remote path contract**

Replace `REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"` with `REMOTE_DEPLOY="$DEPLOY_REMOTE_DIR/deploy"`; create `docker`, `nginx`, and `observability/{loki,alloy,grafana}` below it. Upload root env files directly to `$DEPLOY_REMOTE_DIR/`. Compose commands must use `$REMOTE_DEPLOY/docker/compose.prod.yaml` and `$DEPLOY_REMOTE_DIR/.env.prod-infra`; host-edge scripts receive `$REMOTE_DEPLOY`.

- [x] **Step 3: Update rollback/status/observability/restore scripts**

Every production helper must read the same root env and `$DEPLOY_REMOTE_DIR/deploy` paths. No helper may retain a runnable `infra` fallback; historical path mentions may appear only in the migration decision document.

- [x] **Step 4: Move Playwright to root and update CI**

Set `testDir: 'tests/e2e'`, `testIgnore: 'legacy-vue/**'`, API command `bun apps/api/src/index.ts`, and web command `bun run --cwd apps/web dev --host 127.0.0.1`. Update CI to `node scripts/verify/playwright-cli.cjs install --with-deps chromium` and `node scripts/verify/playwright-cli.cjs test --config=playwright.config.ts`.

- [x] **Step 5: Run path checks**

Run `rg -n "infra/(docker|env|nginx|loki|alloy|grafana|seed|scripts|ffmpeg)|e2e/playwright|e2e/asset-loop|e2e/legacy-vue" --glob '!docs/superpowers/**' .`. Expected: no old executable/config references; only explicit migration notes are allowed.

### Task 5: Synchronize canonical documentation and complete verification

**Files:**
- Create: `docs/decisions/2026-08-24-repository-layout-migration.md`
- Modify: `CLAUDE.md`, `README.md`, `infra/README.md` or remove it after migrating its unique useful content, `docs/03-ops.md`, `docs/04-deployment-runbook.md`, `docs/05-observability.md`, `docs/06-disaster-recovery.md`, and active non-historical docs
- Modify: `docs/superpowers/plans/2026-08-24-repository-layout-migration.md`

**Interfaces:**
- Canonical docs describe root env, `deploy/`, grouped `scripts/`, root Playwright, and the one-time production host migration.
- Historical `docs/superpowers` files remain identifiable as historical records and are not treated as current commands.

- [x] **Step 1: Write the migration decision**

Document the before/after mapping, exact commands for local development and verification, the remote path change, the fact that this task does not execute production deployment, and the required one-time operator action to move existing `/opt/bailian-studio/infra` contents before the first release.

- [x] **Step 2: Update active docs and remove duplicate infra guidance**

Replace current executable examples with root env, `deploy/`, and grouped `scripts/` paths. Remove `infra/README.md` only after its unique instructions are represented in canonical docs; do not remove raw official document snapshots or historical plans.

- [x] **Step 3: Run repository gates**

Run in order:

```bash
pnpm run lint
pnpm run typecheck
pnpm run check:boundaries
pnpm run check:manifests
pnpm run check:db-migrations
pnpm run test:root
pnpm run test
pnpm run build
```

`pnpm run lint` 使用项目定义的 Biome lint 门禁；未执行全仓库 `biome check .` 的自动格式化，因为现有仓库包含大量与本次目录迁移无关的格式差异。根测试命令显式排除 `tests/e2e/**`，Playwright 由独立命令运行。

Run `pnpm run verify` only when `.env.test` and the test database are available. Run Playwright only when the user explicitly wants the browser E2E gate; default front-end validation remains typecheck/build/component tests.

- [x] **Step 4: Verify Git and cleanup**

Run `git diff --check`, `git status --short --branch`, `git diff --stat`, `git ls-files infra`, and `git worktree list`. Remove only empty obsolete directories and migration-generated archives/build outputs that are clearly unused. Do not delete env files, databases, backups, provider snapshots, or user data.

- [x] **Step 5: Commit and push from main**

After all gates pass, commit the code and synchronized docs on `main`, push `main`, re-check `main...origin/main`, and report unrun production/remote migration gates separately.
