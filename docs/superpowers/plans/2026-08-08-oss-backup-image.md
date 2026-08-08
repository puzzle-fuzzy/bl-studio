# OSS Backup Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production PostgreSQL backups upload to Alibaba Cloud OSS from a self-contained backup container, then deploy and verify the enabled disaster-recovery path.

**Architecture:** Replace the `postgres:16-alpine` backup service with a dedicated Node/PostgreSQL-client image. The image contains the existing pinned `ali-oss` SDK and an isolated uploader; only the selected OSS variables are generated into `.env.prod-backup` and injected into the backup service. The deployment script builds/transfers the immutable backup image, transfers the generated backup env file, and runs an explicit backup upload smoke test after startup.

**Tech Stack:** Docker Compose, Node 24, `postgresql-client`, POSIX shell, TypeScript/tsx, Vitest, `ali-oss@6.23.0`, pnpm.

## Global Constraints

- Do not print or commit production credentials.
- Do not depend on a host-installed `ossutil` or `aliyun` executable.
- Keep `BACKUP_OSS_UPLOAD=true` explicit and fail closed when OSS credentials are incomplete.
- Preserve the existing local backup file, gzip integrity check, retention, and five-minute retry loop.
- Deploy only from a clean, pushed full Git SHA.

---

### Task 1: Add the isolated OSS uploader and backup image

**Files:**
- Create: `infra/scripts/upload-backup-to-oss.ts`
- Create: `infra/scripts/upload-backup-to-oss.test.ts`
- Create: `infra/docker/Dockerfile.backup`
- Create: `infra/docker/backup-package.json`
- Modify: `infra/scripts/backup-postgres.sh`
- Modify: `infra/docker/docker-compose.prod.yml`

**Interfaces:**
- `buildBackupObjectKey(filePath: string, prefix?: string): string` returns a normalized OSS object key using the backup filename.
- `uploadBackupFile(filePath: string, env: Readonly<Record<string, string | undefined>>, client?: OssUploadClient): Promise<{ key: string }>` validates the five OSS settings, verifies the file exists, and uploads it.
- The backup container runs `/usr/local/bin/backup-postgres.sh`; when `BACKUP_OSS_UPLOAD=true`, that script calls `/opt/bailian-studio/node_modules/.bin/tsx /opt/bailian-studio/upload-backup-to-oss.ts "$OUT"`.

- [x] **Step 1: Write focused uploader tests**

Test key normalization, required-variable rejection without exposing values, file existence validation, and a successful fake-client upload receiving the expected basename key.

- [x] **Step 2: Implement the uploader**

Use `ali-oss@6.23.0` with `authorizationV4: true`; read only `OSS_REGION`, `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, optional `OSS_ENDPOINT`, and `BACKUP_OSS_PREFIX`. CLI failures print a stable message without provider errors or credentials.

- [x] **Step 3: Build the dedicated image**

Base `infra/docker/Dockerfile.backup` on `node:24-bookworm-slim`, install `postgresql-client`, `gzip`, and CA certificates, install the exact package versions in `backup-package.json`, and copy the shell/uploader scripts into `/usr/local/bin`.

- [x] **Step 4: Wire Compose to the image and isolated env file**

Change `backup.image` to `bailian-studio-backup:${BAILIAN_STUDIO_RELEASE_TAG:?BAILIAN_STUDIO_RELEASE_TAG must be a full Git commit SHA}`, add `env_file: ../env/.env.prod-backup`, and remove the host script bind mount. Keep database/backup directory settings in the explicit Compose environment.

- [x] **Step 5: Run focused tests**

Run `pnpm exec vitest run infra/scripts/upload-backup-to-oss.test.ts` and confirm all cases pass.

### Task 2: Generate and transfer only backup credentials

**Files:**
- Create: `infra/scripts/prepare-backup-env.ts`
- Create: `infra/scripts/prepare-backup-env.test.ts`
- Modify: `.gitignore`
- Modify: `infra/scripts/deploy-prod.sh`

**Interfaces:**
- `buildBackupEnvironment(appEnv, infraEnv): Record<string, string>` copies only OSS upload settings from the two existing ignored env files and adds `BACKUP_OSS_PREFIX`.
- The generated ignored file is `infra/env/.env.prod-backup`; it is transferred to the server with mode `600`.

- [x] **Step 1: Test env projection**

Cover enabled OSS with complete credentials, missing credentials, disabled OSS with explicit acknowledgement, and dotenv-safe quoting for special characters.

- [x] **Step 2: Implement the projection script**

Parse the existing env files without evaluating values, fail without writing output when required keys are missing, and write only the backup-specific variables with mode `600`.

- [x] **Step 3: Harden ignore rules**

Add `infra/env/.env.prod-backup` to `.gitignore`.

- [x] **Step 4: Integrate into deployment**

Run the projection before infrastructure preflight, build/save the backup image with runtime/web images, transfer the generated file, chmod it remotely, and remove the obsolete host-script transfer.

- [x] **Step 5: Run focused tests**

Run `pnpm exec vitest run infra/scripts/prepare-backup-env.test.ts` and verify the generated local env file contains no unrelated application secrets.

### Task 3: Add deployment verification and operational documentation

**Files:**
- Modify: `infra/scripts/deploy-prod.sh`
- Modify: `docs/03-ops.md`
- Modify: `infra/env/.env.prod-infra.example`

- [x] **Step 1: Add an explicit post-start backup smoke**

After Compose startup, execute a one-shot backup container with `docker compose run --rm --no-deps --entrypoint /usr/local/bin/backup-postgres.sh`; fail deployment if local dump or OSS upload fails.

- [x] **Step 2: Update operational docs**

Document the dedicated image, generated `.env.prod-backup`, selected-variable injection, `BACKUP_OSS_PREFIX`, and the post-deploy/manual backup command.

- [x] **Step 3: Update infra example**

Document `BACKUP_OSS_PREFIX` and that the actual OSS credentials remain in `.env.production` and are projected into the ignored backup env file.

### Task 4: Validate, commit, push, deploy, and verify

**Files:**
- Modify: `docs/superpowers/plans/2026-08-08-oss-backup-image.md` (check off completed steps)

- [x] **Step 1: Run complete verification**

Run `git diff --check`, focused tests, `pnpm run verify`, and a Compose config/build check for the backup service.

- [ ] **Step 2: Commit and push**

Commit the implementation and documentation, confirm the worktree is clean, and push the full commit to `origin/main`.

- [ ] **Step 3: Run production deployment**

Run `pnpm run deploy:prod`; the script must pass verify, build/load all three images, run migrations, start the stack, execute the backup upload smoke, and pass the public readiness check.

- [ ] **Step 4: Verify remote state**

Run production status and inspect the backup service's latest successful log marker without printing credentials; confirm the deployed SHA matches `origin/main`.
