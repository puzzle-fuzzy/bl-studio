# bl-studio · 架构审查与待处理事项

> 全量架构复核：2026-08-29（后端 / 前端 / 数据层 / 工程化四线并行审查，全部发现均有源码证据）
>

优先级定义：**P0** = 正在造成损害或安全/正确性问题，立即修复；**P1** = 显著的架构债，近期修复；**P2** = 低风险改进，择机处理。

---

## 一、本轮已修复（2026-08-29）

### 第一批：正确性 / 安全 / CI 紧急修复

- [x] **[P0·CI]** `ci.yml` e2e 任务引用已删除的 `infra/scripts/playwright-cli.cjs` 与 `e2e/playwright.config.ts`（8-24 仓库布局迁移遗留），e2e 门禁自 2026-08-24 起在 main 上持续红。已改为 `scripts/verify/playwright-cli.cjs` + 根目录 `playwright.config.ts`。
- [x] **[P0·Git]** `.gitignore` 追加 `reference-materials/` 时丢失尾行换行；未提交的脏工作树会使 `deploy-prod.sh` 的 `git diff --quiet` 预检直接失败。已补换行（提交需随本批修复一并完成）。
- [x] **[P0·前端]** `creative-assets-store` 登出竞态：`clear()` 清空 pending map 但不清除在途 Promise，用户 A 的在途请求可在登出后把数据写回 store（`generations-store` 有版本守卫，此 store 没有）。已加请求世代（epoch）守卫。
- [x] **[P1·数据]** `director-repository.updateShot` 乐观锁 TOCTOU：SELECT 无 `FOR UPDATE`，版本比较通过后另一并发写入方仍可覆盖（丢失更新）；同文件 `startShotVideo`/`finalizeShotVideo` 均有行锁，唯独用户编辑路径没有。已补 `.for("update")`。
- [x] **[P1·后端]** 导演流程绕过每日配额：API 路径经 `createGenerationUseCase` 传 `quota` 并在事务内 advisory-lock 强制；worker 的 `director-phase-task-handler` 9 处 `createGeneration` 全部不传 `quota`，任务数/成本日限额对导演流程形同虚设。已让 worker 侧创建 generation 统一注入同一份 limits（`readGenerationLimits` 下沉 `@bailian-studio/shared`，API 与 worker 共用同一解析器与 env 键）。
- [x] **[P1·CI]** verify 门禁无 build 步骤：Vite 构建失败（bundler 解析、CSS 管线、循环导入运行时断裂）只能在部署机上首次暴露。已在 verify 流水线与 Windows 任务加入 `build`。
- [x] **[P1·安全]** 公开仓库文档携带生产服务器 IP 与 root 用户（`CLAUDE.md`、`docs/04-deployment-playbook.md`）。已替换为 SSH 别名引用（冒烟脚本改为运行时从服务器解析 IP）。
- [x] **[P1·前端]** `CreatePage`（1,598 行，第二大页面）静态导入打进出站 chunk，与 `lazyPage` 分包策略自相矛盾。已改为懒加载。
- [x] **[P2·后端]** `shares/routes.ts` 私有 `contentTypeForPath` 缺 `.webp`（共享版 `lib/artifact-content-types.ts` 有），webp 分享产物会以 octet-stream 下发。已改为复用共享实现。
- [x] **[P2·后端]** `admin/routes.ts` 从 `../assets/routes` 导入 `assetWithReadUrl`，违反"模块只经组合根获得能力"的边界约定。已下沉到 `assets/service.ts`。
- [x] **[P2·工程]** `turbo.json` globalPassThroughEnv 缺 `VITE_LEGAL_ENTITY/CONTACT_EMAIL/EFFECTIVE_DATE` 与 `GENERATION_DAILY_*`（限额变化会命中过期缓存）。已补。
- [x] **[P2·工程]** 环境文件曾分散在根目录且生产备份需要额外 `.env.prod-backup`；现已统一为 `deploy/env/.env.dev`、`.env.test`、`.env.prod`，备份变量由 Compose 显式投影。

### 第二批：pnpm → bun + turbo 包管理迁移（2026-08-29）

- [x] **迁移范围**：根 `package.json`（`packageManager: bun@1.4.0`、workspaces + catalog、全部脚本去 pnpm）；删除 `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `.npmrc`；`bun.lock` 成为唯一锁文件。
- [x] `scripts/verify/run-workflow.ts` 与 `check-db-migrations.ts` 的子进程启动从 `pnpm`（含 Windows cmd-shim 兼容层）改为 `bun`（单一可执行文件，全平台 shell:false 直启，兼容层删除）。
- [x] CI（`ci.yml` 三个 job + `bailian-official-docs-sync.yml`）：`pnpm/action-setup` → `oven-sh/setup-bun@v2`；`bun install --frozen-lockfile`；verify job 增加 `actions/cache`（`~/.bun/install/cache`，按 `bun.lock` 哈希键控）。
- [x] `deploy/docker/Dockerfile`：去掉 `npm install -g pnpm`；manifest COPY 由 pnpm 四件套改为 `package.json bun.lock`；workspace 全量 / runtime filtered 生产安装改 `bun install`（已用隔离目录实测 `bun install --production --filter . --filter api... --filter worker...`：root 生产依赖 + api/worker 闭包装入，react/recharts 正确排除，与 pnpm filter 行为一致）；web-build 阶段 `bun run --filter` 构建。
- [x] compose（prod + rehearsal）：容器内命令 `pnpm exec drizzle-kit` → `bun x drizzle-kit`；worker `pnpm exec tsx` → `node --import tsx`（保持 Worker 走 Node 运行时的既有约定，bun 只做包管理）。
- [x] 规范性文档（README / CLAUDE / 03-ops / 04-playbook / 各 AGENTS.md）与 `biome.json`（排除 `reference-materials/`，修复嵌套根配置导致 lint 全红）。
- [x] `test:root` 排除 `reference-materials/**`（第三方参考工程的 bun:test 文件被 vitest 的 `scripts` 过滤器误扫，260 个假失败）。
- [x] **验证**：`bun install` ✓、`lint` ✓、`check:boundaries`/`check:manifests`/`check:db-migrations` ✓、`turbo typecheck` 21/21 ✓、`turbo build` 12/12 ✓、Node 24.12 下全量 vitest ✓。

### 迁移注意事项（后续维护者必读）

- **运行时矩阵不变**：API = Bun 运行时（`bun apps/api/src/index.ts`）；Worker / CLI 脚本 / 测试 = Node 24 + tsx。bun 仅替换包管理与任务编排入口。
- **本机 Node 必须是 24.x（`.node-version` = 24.12.0）**：Node 26 的实验性 `localStorage` 全局会让 vitest + happy-dom 环境拿到不可用的 Node 内置实现，`creation-presets.test.ts` 等直接使用裸 `localStorage` 的测试全部失败（本机默认 Node 26 时已实际踩中）。
- `bun x`（= bunx）在容器/CI 无网络时使用本地 node_modules 解析，镜像内不会触发下载。
- 历史文档（`docs/01`、`02`、`06`、`merge-report`、2026-08-24 布局 ADR）中的 pnpm 命令保留为历史记录，未改写。

### 第三批：文件单一职责拆分（2026-08-29 起）

- [x] **[P2-6→已完成]** `packages/db/src/schema.ts` 1,483 行 42 表拆分为 `src/schema/` 下 7 个域文件（identity / ops / generation / credits / creative / community / director）+ 域图注释 barrel（`schema/index.ts`），`schema.ts` 保留为兼容 re-export。域依赖方向：identity ← ops ← generation ← {credits, creative, community}，director → identity，无环。等价性由 `check:db-migrations` 验证：42 表全部加载、`drizzle-kit generate` 零漂移。
- [x] **[P1-E→已完成 2026-08-29]** `apps/worker/src/director-phase-task-handler.ts` 拆分：六个同构阶段（characters/locations/storyboard/continuity/rebuild/dialogue）收敛为 `director-text-phase.ts` 的泛型 `runTextPhase`（幂等创建→进度→轮询→解析→完成，错误码族由 codePrefix 派生，行为与原六份拷贝逐字一致）；5 个中文 LLM prompt 模板 + 运行输入快照迁入 `director-llm-prompts.ts`；handler 1,721→1,211 行（保留 analyze/chat、bgm、videos、assemble 特化路径）。新增 `tests/director-text-phase.test.ts`（10 例）锁定状态流契约——该执行骨架此前零测试。



## 二、待处理：P0（结构性大项，需专门排期）

### P0-A. `DirectorProjectPage.tsx` 巨型组件（✅ 首轮拆解完成 2026-08-29：3,144 → 1,826 行）

**首轮成果**：20 个内嵌组件 + 10 个工具函数提取到 `components/director/review-components.tsx`（1,358 行），主页面从 3,144 行瘦身到 1,826 行（-42%）。typecheck/build/tests 全绿，lint 零警告。
**✅ usePhaseReview 完成（2026-08-29）**：24 个分散的 useState（6 阶段 × {modelId, text, result, stale}）统一为 6 个 `usePhaseReview<R>()` 调用。通过解构保持原有变量名（analysisResult/setAnalysisResult 等不变），其余代码零改动。**待后续**：将 review-components 进一步按阶段拆为独立文件。

**原证据**：单文件 160KB；`DirectorProjectPage()` 函数体 109→1810 行；头部声明 66 个 `useState`（112–180），13 个 `useEffect`，25 个 async handler；JSX return 起点 1181 行长约 630 行；同文件还内嵌约 20 个组件（`ScreenplayChatWorkspace`@2574、`StoryboardShotCard`@2444、`AnalysisReview`@2788 等），而 `components/director/` 只有 1 个文件。项目加载 effect（354–510）单次 `.then` 内 30+ 个 setState 手工复位全部原子，两条复位路径（首载 + 轮询终态）各自完整枚举一遍；6 个阶段各自维护 `{text, result, stale, modelId}` 四元组 ≈ 24 个原子结构重复；301–352 行 6 个"默认模型选择" effect 结构完全相同。

**方案**：
1. 抽 `usePhaseReview(phase)` hook + `<PhaseReviewSection>` 组件（24 原子 → 6 实例）。
2. 内嵌组件迁至 `components/director/`。
3. 用 `resetPhaseState()` 单点复位或 zustand `director-project-store`（按 projectId 键控）替代 30-set 级联；id 切换复位 effect 正是 store selector 订阅形态。
4. 抽 `usePreferredModel(modelId, list, preferredId)` 合并 6 个模型默认 effect。

**前置**：先补 store/hook 级测试（见 P1-F），否则重构不可验证。

### P0-B. web/admin 应用级复制粘贴（≈3,000 行字节级相同）

**证据**：16 个 `components/ui/*` 完全相同（`dropdown-menu.tsx` 269 行、`chart.tsx` 373 行等）；`shared/MediaLightbox.tsx`（166 行）、`lib/api.ts`、`lib/utils.ts`、`lib/chunk-recovery.ts`、`RouteErrorElement.tsx` 两份；`lib/user-error.ts` 已分叉（web 多 8 个错误码映射 + `canResendVerification()`，admin 用户看到的是未本地化的兜底文案）；两份 `styles.css` 共享同一段 shadcn oklch 主题块；`ProtectedRoute`/`RedirectIfAuthed`/`lazyPage` 骨架重复；两份 vite config 复制同一 `codeSplitting.groups`。任何一处修复不会到达另一应用——`user-error.ts` 的漂移已经是现实而非假设。

**方案**：新建 `packages/ui`（16 个原语 + MediaLightbox + RouteErrorElement）与 `packages/lib-client`（api 单例、utils、user-error、chunk-recovery），shadcn 主题块收敛为共享 css；两应用只保留各自 shell。与 P1-A（design-tokens）一并定夺样式令牌归口。

### P0-C. 服务端状态管理三种并行模式、无共享取数层

**证据**：同一"列表 + 游标 + loading + 过期守卫"关注点存在 4 种写法——
1. zustand + 模块级版本计数（`generations-store.ts:63-69`，登出 `reset()` 显式 bump 版本）；
2. zustand + pending-promise 去重、无任何过期守卫（`creative-assets-store.ts:45-46`，本轮已加 epoch 修登出竞态，但与 generations-store 仍是两套）；
3. 页面局部 `useState` + `requestSeq` ref（admin `UserListPage.tsx:58-76`、`TasksPage.tsx:303-341`、web `GalleryPage.tsx:62-122`）；
4. 页面局部 `let cancelled = false`（`CreatePage.tsx:216-238`、`GenerationDetailPage.tsx:107-112`）。

四种守卫语义互不相同（新调用失效 / 仅卸载失效 / 不失效）。admin 无任何数据 store，9 个页面各自携带 `items/loading/error/page` 样板（UserListPage 20 个 useState）。

**方案**：二选一并全仓统一——(a) 引入 TanStack Query（`use-generation-events` 的 SSE 失效提示天然就是 Query 的语言）；(b) 把 generations-store 模式抽成 `createCursorListStore` 工厂强制使用。倾向 (a)，admin 页面可顺带消灭样板。

## 三、待处理：P1（重要架构债）

### P1-A. `packages/design-tokens` 是死代码，其值被硬编码两份且已漂移

零消费者（无任何 app 依赖该包）；`tokens.css` 定义的 `#e46b78/#e1b15c/#a5d09d` 以任意值 Tailwind 类硬编码在 `CreativeProjectDetailPage.tsx:42-63` 与 `AssetWorkbenchPage.tsx:70-89`（45 处），两份 `versionTone()` 已漂移（一个返回 light/dark 成对值，一个只返回 dark）；`StatusBadge.tsx` 又用 Tailwind 色板自建第三套。状态→颜色语义存在 ≥4 处定义。**方案**：要么接线（`--rb-*` 映射进共享 `@theme inline`，页面删硬编码 hex，StatusBadge/admin 变体改由 `GENERATION_STATUS_TONES` 驱动），要么删除该包。与 P0-B 的 packages/ui 一并处理。

### P1-B. `GenerationRepository` 上帝接口（≈120 方法 / 4,117 行单文件，横跨 ≥8 个限界上下文）

单一接口混合：generation 生命周期、任务队列 claim/lock/save、worker 心跳、用量分析、provider 请求审计、gallery/点赞/收藏、admin 审核、admin 任务中心、社交通知、提示词库、模型成本。它仍是 generation 业务路由与整个 worker 的公共依赖——变更放大与合并冲突的直接来源。**方案**：按上下文拆分（任务队列 port 移入独立 task-repository；内容/社交/admin/通知/分析各自成 repository 或独立接口，在 `ApiDependencies` 组合）。**已开始**：Worker 已切到最小任务生命周期 port，gallery、通知、提示词库、反馈、举报、admin gallery、admin 任务中心、分析、资产、分享和 API 审计已切到各自窄 port；对应 SQL 已从各自中央实现文件物理移出，内容域不再通过 generation repository 聚合，核心接口仅保留 generation/worker 所需能力。

**P1-B 当前进度（2026-08-30）**：提示词库、反馈、举报、admin gallery、admin 任务中心、分析、资产、分享、API 审计和用户用量已分别切换到窄 port；admin 任务请求上下文也已归档到 `AdminTaskRepository`，调用统计与用量查询 SQL 已分别移入 `analytics.ts`、`usage.ts`，资产/分享 SQL 已分别移入 `assets.ts`、`shares.ts`，API 审计写入 SQL 已移入 `audit-events.ts`。生成应用服务的每日限额预检已显式注入 `UsageRepository`，Worker 的 provider 请求审计写入已迁移到 `ProviderRequestAuditRepository` 与 `provider-requests.ts`；`GenerationRepository` 核心接口已移除资产/分享/用量读取、API 审计写入、provider 审计写入、全部 content facade 方法以及任务生命周期方法，生成详情诊断与故障恢复扫描也已分别切换到独立的 `GenerationDiagnosticsRepository`、`GenerationRecoveryRepository`。URL 工厂与隔离测试句柄已改为直接暴露核心 repository 和各域窄 port；`GenerationRepositoryCompat` 与 `content.ts` 已删除，仓储测试按窄 port 组合 harness。P1-B 的兼容删除窗口已关闭，下一步转向独立 repository 包的物理拆包或路由 service 层收敛。

admin gallery、admin 任务中心和成本/留存分析已分别切换到 `AdminGalleryRepository`、`AdminTaskRepository`、`AnalyticsRepository`；用户资产、公开分享、API 审计和用户用量也已完成 API 依赖收敛，后台治理与举报下架联动不再直接依赖 `GenerationRepository`。P1-B 的内容/横切能力拆分、任务生命周期拆分与兼容 facade 清理已完成，生成详情诊断已改为独立只读 port，下一步继续清理业务 repository 对 `task_records` 的直接读取。

### P1-C. 任务队列持久化与生命周期边界（✅ 完成，2026-08-30）

**已实施**：
- ✅ `packages/db/src/task-serialize.ts`：唯一序列化函数 `taskInsertValues(task: TaskRecordInput)` + 结构化类型定义（不依赖 task-engine，避免 workspace 链接问题）
- ✅ `packages/db/src/index.ts`：导出 `taskInsertValues` + `TaskRecordInput` 类型
- ✅ `packages/generation-repository/src/repository.ts`：任务生产改为调用 `@bailian-studio/task-repository.enqueueTask(tx, task)`
- ✅ `packages/media-repository/src/repository.ts`：任务生产改为调用统一 `enqueueTask`，读取映射复用 task-repository
- ✅ `packages/director-repository/src/repository.ts`：手写 inline insert 改为调用统一 `enqueueTask`
- ✅ 验证通过（2026-08-29）：typecheck 26/26 + build 14/14 + 1,077 tests + boundaries + manifests + docs snapshot 全绿
- ✅ `packages/task-repository` 新增，集中拥有 claim/renew/save/get 与 Date/JSON mapper；`task-engine` 继续只拥有状态机。
- ✅ `persistence-runtime` 为 Worker 注入独立任务队列句柄；WorkerLoop 只依赖 claim/renew/save 的最小 port。
- ✅ `generation-repository` 的任务 SQL 已委托 `task-repository`；新增并发认领、租约护栏、毒丸隔离和错误映射测试。GenerationRepository 核心接口中的旧任务方法已移除，Worker 强制注入任务队列 port。
- ✅ `TaskQueueTransactionStore.findTask` 已收敛 media 幂等命中路径的任务查询，避免业务 repository 为简单关联查询直接 import `task_records`。
- ✅ `TaskQueueTransactionStore.cancelQueuedTasks` 已收敛资产删除时的 thumbnail 任务取消，状态转换统一经由 task-engine。

当前仍由 3 个业务 repository 构造各自领域的 TaskRecord，并由持久化组合根注入同一个
`TaskQueueTransactionStore`；各 repository 继续把调用方事务传给该 store，这是有意保留的原子性边界。
`task-repository` 已接管 task_records 的序列化、插入、生命周期和回读，但不接管跨域业务事务的开启；新增
`TaskQueueReadStore` 后，generation 诊断和恢复扫描也不再直接 import `task_records`。
业务事务内的简单任务查询与 queued 任务取消也应通过其窄 transaction store；generation 的幂等回读与轮询去重、资产删除时的 thumbnail 取消已迁移。Worker 的僵尸候选扫描已迁移到独立的 `GenerationRecoveryRepository`，只保留最终 `failGeneration` 在生成核心 repository 中；admin 任务跨域投影不迁入 task-repository，待独立 `admin-repository` 契约确定后再做物理拆包。

### P1-D. API 分层不一致（✅ gallery + admin service 层完成 2026-08-29，其余 11 个渐进迁移）

**已完成**：`gallery/service.ts` 新建——封面解析（resolveGalleryCover）、产物映射（resolveGalleryArtifact）、社交通知编排（notifyAuthorOnInteraction）、本地产物流式（serveLocalArtifact）从 gallery/admin 两处路由下沉到共享 service。admin/routes.ts 的 adminGalleryCover/adminGalleryArtifactItem 逐字重复副本删除，改为导入同一 service（仅 localUrlPrefix 不同：/api/gallery vs /api/admin/gallery）。gallery 路由从 411 行减至约 350 行（-15%）。
**✅ director service 完成（2026-08-30）**：`director/service.ts` 在原有纯模型/计价规则之上增加 `DirectorApplicationService`，统一阶段估价、合成预检、脚本聊天运行、视频/音乐/合成运行创建和单镜头重试前置校验；API 组合根负责注入，路由保留认证、校验、日志和响应适配，Worker 继续负责异步状态推进。

**✅ creative asset application service 接入完成（2026-08-30）**：`creative-assets/service.ts` 已由 API 组合根创建并注入，路由不再自行实例化 facade；版本批准迁移收敛到显式 `publishVersion` 入口，服务层测试覆盖注入与发布边界。
**✅ 单次生成产物收录完成（2026-08-30）**：新增 `collect-from-generation` vertical slice，在 repository 一个事务内创建资产、可选项目关系、版本和参考图；数据库以用户范围 `Idempotency-Key` + 请求指纹处理安全重试，API/client/Studio 工作台均已接线，覆盖回滚、重复请求和参数冲突测试。
**🚧 批量生成产物收录第一阶段（2026-08-30）**：已新增 batch contracts、批次/批次项表、repository 原子写入、API service/route 和 typed client，覆盖 all-or-nothing、批次级幂等和参数冲突；审计 outbox producer/consumer、admin 失败重放 API、Worker 失败量/延迟/异常最小指标契约与 Loki/Grafana 运营视图已完成，Studio 多选入口与专用指标存储仍待按实际规模处理。

有 service：generations/assets/artifacts/shares/creative-assets/director。无 service 的代表：`gallery/routes.ts`（411 行，社交通知编排、封面解析、本地产物流式 + 错误映射全部内联）；`admin/routes.ts`（765 行，复制了 gallery 的封面/产物逻辑 `adminGalleryCover`@48-89）。本地产物流式 + ENOENT/413/500 映射在 gallery 与 shares 近乎逐字重复。**方案**：统一到 generations/assets/director 模式（路由=认证+校验+整形；creative asset 已完成单次与批量原子收录、审计 outbox、管理员失败恢复和 Grafana 运营视图，下一步聚焦批次多选 UI 与后续 generation-repository 拆分）。

### P1-E. `director-phase-task-handler.ts` 1,707 行，6 个近乎相同的阶段函数

`processCharactersPhase`/`Locations`/`Storyboard`/`Continuity`/`PromptRebuild`/`Dialogue` 重复同一 ~90 行骨架（读 generationId → 幂等 createGeneration → setPhaseRunProgress → 轮询 → 解析 → scope 校验 → complete/fail），差异仅 prompt 构造与解析器；全部中文 LLM prompt 模板内嵌同文件（1536–1618）。**方案**：抽 `runLlmPhase(run, task, deps, { phase, buildPrompt, parseOutput, scopeCheck })` 泛型函数；prompt 模板独立成模块（解析器已各自独立）。

### P1-F. 测试覆盖结构性失衡：前端零组件/页面/hook 测试，后端零覆盖率度量

apps/web 18 个测试文件 = 17 个 `src/lib/*` + 1 个 store；components/pages/hooks 全零。apps/admin 仅 2 个 lib 测试。最复杂的逻辑（SSE 兜底轮询 `use-generation-events.ts:83-89`、DirectorProjectPage 轮询/终态机、30-set 复位级联）无任何测试。e2e 仅覆盖 web asset-loop，admin 破坏性批量操作（批量删除/授权）无 e2e。另一面：`test:coverage` 门禁实际只覆盖 `apps/web/src/lib/**`（60 阈值），API/worker/17 个包零覆盖率度量——"覆盖率门禁"名不副实；verify 先跑 `test` 再跑 `test:coverage`，web 测试每次双跑。**方案**：(1) 为 P0-A 重构先补 director store/hook 测试；(2) 覆盖率门禁如实改名（web-lib-gate）或逐包补配置；(3) verify 去掉双跑；(4) admin 补最小 e2e（登录 + 批量操作）。

### P1-G. model-core 并非 provider 中立：DashScope 烧进"核心"包

`ModelProvider = 'dashscope'` 单成员联合（types.ts:26）；`ProviderRequestMapping` kind 就是 `'dashscope-chat' | 'dashscope-image-*' | 'dashscope-video-task' | 'dashscope-audio-task'`（270-275）；transport 头引用 `X-DashScope-Async`；9,059 行中 6,549 行是 DashScope manifests。下游（provider-dashscope client、compiler）确实干净，但接第二个 provider 就要改"中立"核心的类型联合与注册表——抽象边界倒置。**方案**：manifests 与 `ProviderRequestMapping` 移入 `dashscope-manifests` 包（或 `kind: string` + provider 域 schema），model-core 收敛为 provider 无关的参数/计价/校验。趁现在便宜，晚了贵。

### P1-H. repository 层五套并行约定（✅ kit 创建 + credit-ledger 示范 2026-08-29）

**已创建** `packages/shared/src/repository-kit.ts`：
- `encodeCursor<T>()` / `decodeCursor<T>()` — base64url(JSON) 游标编解码（取代 6 份手写实现）
- `clampLimit(limit, policy)` — 统一限值钳制（default/max/非法值处理）
- `DEFAULT_LIMIT_POLICY` / `WIDE_LIMIT_POLICY` — 常用策略常量
- `RepositoryError` — 统一错误基类（各域错误类应继承）
- ~~`expectRowLock()`~~ 已移除（过度设计）

**已示范应用**：credit-ledger 的本地 encodeCursor/decodeCursor 改用 kit 版本（适配层保持 CreditLedgerError 错误码兼容）。其余包渐进迁移。

- 错误：5 个同形不相关类（CreditLedger/GenerationRepository/CreativeAssetRepository/Director/Media RepositoryError），`shared/src/errors.ts:1-22` 自述"并未统一继承本基类"——基类存在但零使用；generation-repository 甚至复制了一份 POINTS_* 码。
- 游标：6 份手写 base64url(JSON) 编解码（auth:204、credit-ledger:104-118、creative-asset:67-86、generation×2、director:60-67）。
- 限值：generation/creative-asset 静默钳制；credit-ledger 用语义错误的 `POINTS_ADJUSTMENT_INVALID` 报分页问题；director 完全不钳制（`repository.ts:577` `.limit(input.limit + 1)`）。
- 锁：见已修复项；credit/creative-asset/generation/media 均有 `for('update')` 惯例，director 此前是例外。

**方案**：抽 `repository-kit`（keyset 游标编解码、限值钳制、`RepositoryError` 基类 + 域前缀码、`withRowLock` 助手）为共享叶子包，6 个数据包统一采用。与 TODO 末尾"错误类型跨层统一继承"议题合并推进。

### P1-I. generation-repository 越界读写 creative-asset 域表（✅ 完成 2026-08-31）

~~直接 import `creativeAssets/creativeAssetVersions/creativeProjects/creativeGenerationContext*`（`repository.ts:40-46`）做跨域校验（415-499），而同一批表归 creative-asset-repository 所有——两包写读同表、错误词表与映射各行其是。~~

**已实施**：新增 `creativeGenerationContextStore` 事务端口，由 `creative-asset-repository` 独占创意资产域表的锁定校验、上下文快照持久化、读取和指纹查询；`generation-repository` 只在自己的 generation 事务中注入并调用该端口，保留原子性但不再直接 import 创意资产表。新增边界规则与集成测试，禁止生成仓储重新绕过端口。

### P1-J. 审计动作枚举三处定义（✅ 完成 2026-08-29）

**已实施**：`AUDIT_ACTIONS` 从 generation-repository/audit-types.ts 移到 `packages/db/src/audit-actions.ts`（唯一事实源）。generation-repository 改为 re-export（兼容性）。审计一致性测试的导入路径已适配。根 package.json 补 `@bailian-studio/db` 依赖（后续优化：改为直接 db 依赖替代 gen-repo 传递）。Chrome 扩展测试已从 vitest 排除（`--exclude='tools/**'`）。

46 动作 CHECK 内联 schema.ts:158；`AUDIT_ACTIONS` 运行时数组在 generation-repository/audit-types.ts:13-56（自称"唯一运行时事实源"）；迁移链内第三份，靠 `audit-action-consistency.test.ts` 对账。因 drizzle-kit push 检测不到 CHECK 表达式变化，每次 `db:push` 都要跑 `ensure-audit-action-constraint.ts`——而它从 repository 包 import 常量来定义 DB 约束（根 package.json 被迫 devDep 仓库包）。**方案**：动作枚举移入 packages/db（schema 邻接常量），CHECK 由该单一事实源生成；动作集继续膨胀则改查表 + FK。

### P1-K. 包边界检查器覆盖不全（✅ 规则补全 2026-08-29）

**已补全**：`creative-asset-repository`（只许依赖 db + creative-asset-contracts）和 `director-repository`（只许依赖 db + shared）的边界规则已添加到 check-package-boundaries.ts。边界检查通过。

`scripts/verify/check-package-boundaries.ts` 对 `creative-asset-repository`、`director-repository`、`creative-asset-compiler` 零规则（这两个 repository 拥有 ~15 张表却可 import 任何东西）；无环检测；declared-vs-actual 依赖核对仅覆盖 provider-dashscope 一个包。**方案**：补齐三包规则；加通用环检测；把 package.json 声明依赖与实际 import 一致性检查推广到全部包。

### P1-L. CI 效率：无 turbo 缓存、测试强制串行、无并发取消

仅 `cache: pnpm`；`.turbo` 无持久化、无远程缓存；`run-workflow.ts` 强制 `--concurrency=1`；147 个测试文件大量每文件建物理 PG 库重放全量迁移；无 `concurrency: cancel-in-progress`。每 PR 全价 15-30+ 分钟——这正是 P0 级 CI 损坏 5 天无人察觉的土壤。**方案**：持久化 `.turbo` 或启用远程缓存；加 concurrency 组；评估 e2e 与 verify 尾段并行。

## 四、文件单一职责盘点（2026-08-29 全仓扫描）

> 口径：非测试源码行数；500+ 行即视为需要拆分候选。数量 ≠ 全部要拆，按"多职责混杂度 × 变更频率"排序处理；数据 schema 与第三方 vendored 代码不在列。

### 巨型文件清单（Top，按行数）

| 文件 | 行数 | 职责混杂情况 | 处理 |
|---|---|---|---|
| `packages/generation-repository/src/repository.ts` | 4,117 | ≥8 个限界上下文（见 P1-B） | 按域拆包，最高优先 |
| `apps/web/src/pages/DirectorProjectPage.tsx` | 3,144 | 页面 + 20 个内嵌组件 + 66 useState（见 P0-A） | 拆组件 + store |
| `packages/director-repository/src/repository.ts` | 2,560 | 9 表 CRUD + 阶段编排 + 快照组装混在一文件 | 随 P1-C/P1-D 顺带拆 |
| `packages/api-client/src/generation-client.ts` | 1,849 | 单文件承载全部生成域端点（列表/详情/取消/重试/SSE） | 可接受（同域），增长时按子域拆 |
| `apps/worker/src/director-phase-task-handler.ts` | 1,721 | 6 个同构阶段函数 + 全部 LLM prompt 内嵌 | **本轮进行中**（P1-E） |
| `apps/web/src/pages/CreatePage.tsx` | 1,598 | 表单 + 深链恢复 + 资产选择 + 对比批次 | 随 P0-C 处理 |
| ~~`packages/db/src/schema.ts`~~ | ~~1,483~~ | ~~42 表 8 域单文件~~ | **✅ 已拆**（schema/ 7 域文件） |
| `packages/api-client/src/schemas.ts` | 1,348 | 全部 API 响应 zod schema | 可接受（纯声明式），按域分组注释即可 |
| `packages/creative-asset-repository/src/repository.ts` | 1,201 | 单域单文件 | 可接受 |
| `packages/auth/src/service.ts` | 910 | 邮箱认证 + GitHub OAuth + 会话管理 | 下次触碰时拆 oauth 子模块 |
| `apps/web/src/pages/GenerationDetailPage.tsx` | 882 | 页面 + 产物预览 + 任务操作 | 观察 |

### 中型热点（500–900 行，仅列多职责者）

- `apps/worker/src/generation-task-handler.ts`（804）：submit/poll/取消/计费守卫混排，但均为同一状态机职责，暂留。
- `apps/api/src/modules/admin/routes.ts`（764）与 `apps/web/src/pages/GalleryPage.tsx`（756）：见 P1-D / P0-C。
- `packages/auth/src/repository.ts`（743）、`apps/web/src/pages/AssetWorkbenchPage.tsx`（746）：单域，暂留。

### 本轮新发现（工程化）

- [ ] **[P1·门禁·预先存在]** `docs:bailian:snapshot:check` 在本地必然失败：已提交快照处于 partial 状态（101/238），且阿里云帮助中心对本机 IP 返回反爬质询页，`docs:bailian:sync` 无法在本地补全（实测 51/253 后被质询中断）。该门禁依赖 GitHub cron（不同出口 IP）重同步自愈；若 cron 也持续被质询，需在 sync 脚本加退避/分批拉取或降级该门禁为 advisory。**verify 全门禁在本机只能跳过此步运行**。
- [ ] **[P2·门禁]** `check-db-migrations` 存在假阴性窗口：schema 模块加载抛错（如拆分期间的 `ReferenceError`）时 drizzle-kit 仍可能 exit 0 且无文件产出，门禁把"无法加载"误判为"无变更"。建议断言 generate 输出包含表清单（`42 tables`）或捕获 stderr 非空即 fail。
- [ ] **[P2·环境]** `engines.node: ">=24.0.0"` 放行了 Node 26，而 Node 26 的实验性 localStorage 全局会破坏 vitest + happy-dom（已实测）。建议收紧为 `>=24 <26` 或在 README 强调 `.node-version`。
- [x] **[P2·turbo→已完成]** turbo.json 为 10 个 typecheck-only 包（api/worker/db/auth/storage/×repository）声明了空 outputs，build 零警告。


## 五、待处理：P2

- [ ] **[P2-1]** 错误码双词表：6 个类型化错误类经 `http-errors.ts` 穷举映射，但 gallery/shares/notifications/models 路由绕开它手写字符串码（`'GALLERY_ITEM_NOT_FOUND'` 等，gallery/routes.ts:200,334,396-400），`MODEL_NOT_FOUND` 同时存在于两套词表。方案：路由级条件码进类型化注册表，或每模块扩类型化错误类。
- [ ] **[P2-2]** 认证默认开放：每个受保护 handler 手工 `requireAuthUser`（当前覆盖完整、已核验），但安全模型依赖"每个新路由记得调用"。方案：模块级 guard 插件，未显式标记 public 的路由默认拒绝，让遗漏成为注册期错误。
- [ ] **[P2-3]** worker 无死信/再驱动：耗尽 `maxAttempts` 的 `director.phase`/`media.*` 任务永久 failed，仅 generation 域有用户重试路由。方案：至少补 admin 再入队动作。
- [x] **[P2-4]** 生产存储校验在 api/worker 两处重复（`env.ts:99-102` / `config.ts:155-163`），`localhost:5002` 默认值同样两份。已下沉到 `@bailian-studio/storage` 的共享生产配置校验。
- [ ] **[P2-5]** director 路由校验错误中文消息（`director/routes.ts:364` 等）与其余 API 英文消息不一致；director-repository 代码风格（tab/双引号/裸 UUID id）与全仓不符。方案：错误文案统一走 locale 机制，格式随下次触碰收敛。
- [x] **[P2-6→已完成 2026-08-29]** 单 schema 文件 1,483 行 42 表混 8 个域（packages/db/src/schema.ts），audit 列样板重复 30+ 次。已拆为 `src/schema/*.ts` 7 个域文件（见"第三批"）。
- [ ] **[P2-7]** push/migrate 双轨 + baseline 脚本 + 审计约束脚本 = 三套 schema 协调机制；`0042_backfill_consolidation.sql` 在链内做破坏性数据回填。方案：开发库收敛到 migrate（漂移门禁已就位，收敛成本低）。
- [x] **[P2-8→已完成]** `providerCancelStatus` 注释写 `'none'`，代码实写 `'not_requested'/'succeeded'/'unsupported'`，且列无 CHECK（schema.ts:241-242）；`generation_records.status` 同样无 CHECK，与全 schema 惯例不符。方案：下次迁移补 CHECK 并修注释。
- [x] **[P2-9]** shared 正在重演"万能包"：director 域契约（557 行 director.ts + 162 行 director-assembly.ts，~30 个 zod 导出）挤在 logger/metrics/errors/validation 里——已抽出纯 `director-contracts` 包，并同步 API、Worker、repository、api-client 与边界门禁。
- [x] **[P2-10]** `credit-ledger.releaseStaleReservations` 候选扫描无锁，与在途 settle 竞态时可能提前释放（CHECK + JS 守卫保证不坏账，但可能 succeeded-but-uncharged 或 settle 假失败）。已通过候选行 `for update` 与账户锁后复查，串行化 settle/refund 线性化点。
- [x] **[P2-11→已完成 2026-08-31]** 纯 SSE 事件映射与编码包已从 `event-bus` 物理重命名为 `sse-protocol`；真实 outbox+LISTEN 管道仍由 generation-repository/API 组合，包名不再暗示其拥有发布/订阅运行时。
- [x] **[P2-12→已完成 2026-08-31]** media-repository 的组装输入与 generation-repository 的生成/产物 JSON 回读已统一使用 Zod record/schema 校验；畸形持久化值现在显式抛出 `DATABASE_ERROR`，不再被静默丢弃或以未校验对象返回；同时移除无调用方的 `safeParseJsonRecord`。
- [ ] **[P2-13]** 15 个 shell 脚本无 shellcheck/shfmt 门禁；`env_value()` awk 解析器复制 6 份（deploy-prod/prod-observability/rollback/prod-web/prod-status/sync-dashscope-key）。这些脚本以 root 经 SSH 跑生产。方案：加 shellcheck 门禁 + 抽公共 sourcing。
- [ ] **[P2-14]** 指标仅进程内存（重启即失，无 Prometheus 导出）；`/api/metrics` 名字超卖。方案：接 Loki/Prom push 或文档明示为快照语义。
- [ ] **[P2-15]** biome 只 lint 不 format 校验，格式漂移累积为噪音 diff。方案：verify 加 `biome format --check`（或 `biome check`）。
- [ ] **[P2-16]** admin 两套分页模型并存（UserListPage 页码式 vs TasksPage 游标栈式）；web stores 是游标式。方案：随 P0-C 统一。
- [ ] **[P2-17]** admin 表单零客户端校验（建用户/发积分仅 HTML required，错误只能等 server toast）。方案：表单接 zod（api-client 已依赖 zod，schema 可复用）。
- [ ] **[P2-18]** 6 处 `<img>` 缺 alt（MediaLightbox 双份、PromptSegments:34、AssetThumbnail:29）。方案：随 P0-B 的 packages/ui 修复 MediaLightbox，其余点改。
- [x] **[P2-19→已完成]** docs/02-design.md 目录树已更新为当前实际结构（studio/writer/canvas/admin + deploy/ + playwright.config.ts）。
- [x] **[P2-20→已完成]** `compose.prod.yaml:272` 挂载 `../scripts/production-monitor.sh` 依赖远端目录布局，本地跑 prod compose 会静默失效。方案：compose 内注释远端路径依赖。
- [ ] **[P2-21]** e2e 为一个纯 API spec 安装完整 chromium（~300MB/次）。方案：移除 install 步骤或拆出 browser spec job 时再装。
- [ ] **[P2-22]** auth 包为 `ensureCreditAccountInTransaction` 一个函数依赖 credit-ledger（注册预建零额账户；generation-repository 已有惰性建户）。方案：助手下沉 db 侧或接受惰性建户解耦。

## 六、历史遗留议题（保留观察）

- [ ] 为资产工作台补页面级 E2E 与真实浏览器验收；当前单元/API/仓储和生产构建门禁已覆盖。
- [ ] 后续再规划剧本上传/生成与人物、场景、道具提示词分析，不把剧本逻辑塞进资产 repository 或 Provider executor。
- **会话滑动续期**：当前 7 天绝对 TTL；需先定会话策略再评估复杂度。
- **错误类型跨层统一继承**：并入本档 P1-H（repository-kit）推进，不再单列。

## 七、三前端拆分与参考移植总方案（2026-08-29 与所有者确认）

### 决策记录

- **画布 = Krea 式**：节点=单次生成，连线=引用语义，手动触发，复用现有 createGeneration + task-engine；不做 Comfy 式拓扑执行图。交互骨架参考 `reference-materials/bailian-canvas` 的 MediaNode/ParamsDropdown/拖线生成节点。
- **部署 = 同域路径四 app**：`/`（studio 创作工作区）、`/writer`（剧本）、`/canvas`（画布）、`/admin`。cookie session + nginx 同源反代，登录态零成本共享。canvas 与 studio 功能等价（同一批生成能力的另一种创作视图）。
- **素材库三 app 共享**（API creative-asset 域已就绪，纯前端信息架构）。
- **剧本流程简化**（替代现 director 深管线）：剧本（手写或一段文字 AI 生成）→ 实体提取（角色/场景/道具 + 提示词，人工审核）→ 可选生成实体图片（引用素材库）→ 分镜自动挂接实体参考 → 逐镜头确认/重生成 → 逐镜头视频 → 导出。连续性降级为 linter；不做 ffmpeg 成片替代剪辑（转场无法用 concat 实现）；装配仅保留为可选预览。
- **社区功能（画廊/提示词库/分享）随 studio**。
- **uhyc 借鉴**：声明式模型定义→动态表单的模式现 model-core 已具备（是其超集），真正要拿的是**富参数控件词汇**——分辨率 LUT 选择器、色板（palette）、镜头列表等控件作为 ModelParameter 的 UI control 提示，实现一次放 packages/ui，studio 表单与 canvas 节点共用；其余（模型定义/定价/轮询）均为现仓库子集，跳过。

### 分批执行（每批独立可验证、保持全绿）

- **Batch 0 前置工程**：0a `packages/ui`（18 个共享原语，✅ 2026-08-29：两 app 去重、button/input 以 web 版统一、Tailwind @source、边界纯度规则）→ 0b `packages/lib-client`（✅ 2026-08-29：api 单例/user-error/chunk-recovery/MediaLightbox/RouteErrorElement 归一，admin 顺带补齐 8 个缺失错误码映射与 canResendVerification，app 侧留一行 re-export shim）→ 0c 服务端状态统一 TanStack Query（✅ 基建 2026-08-29：catalog 注册、lib-client 出 AppQueryProvider/createAppQueryClient（4xx 不重试策略）、两 app main.tsx 挂 Provider、admin StatsPage 作为参考模式迁移完成；admin 8/8 页全部完成（✅ 2026-08-29）：Stats/UserList/Tasks 用 useQuery（UserList 带 keepPreviousData，操作反馈 notice 与查询错误 queryError 分离）；Feedback/Reports/Gallery/UserDetail-资产 用 useInfiniteQuery；Analytics 拆三个并行 useQuery；行内状态更新改 invalidate/缓存补丁，requestSeq 手写守卫在 admin 内全部作废。web 侧进行中：✅ 关键基建——登出清空 Query 缓存（lib-client 暴露 getAppQueryClient，web 经 query-reset.ts 注册进 private-data-reset 注册表，取代逐 store reset）；✅ credits-store → use-credit-balance（焦点刷新保留、staleTime 60s，store 删除）；✅ generation-artifacts-store → use-generation-artifacts（按 recordId 键控，弹窗 enabled=open）。✅ model-catalog → use-model-catalog（9 个消费文件全部重写，staleTime 5 分钟，目录重载按钮改 invalidate； getState() 命令式用法改组件级 hook）。✅ reference-assets（部分）——useReferenceAssets hook（useQueries 实现，键 [assets,item,id]，retry 关闭对齐原"缺图静默"）；GenerationListItem 与 GenerationDetailPage/ParamsCard 已迁移；store 暂留：DirectorProjectPage 有命令式 loadReferenceAssets 用法（该页排期 P0-A 拆解时一并消灭，避免双缓存）。✅ assets → use-asset-list（useInfiniteQuery；invalidate 天然保留翻页深度，P1-01 手工合并逻辑作废；消费方 AssetPickerDialog/AssetWorkbenchPage/LibraryPage 全迁；**use-generation-events 的 SSE 事件已接 queryClient.invalidateQueries——SSE→Query 失效模式打通**，后续 generations/notifications 沿用）。✅ creative-assets → use-creative-assets（列表 useInfiniteQuery / 详情 useQuery / 项目归属同步 mutation+invalidate；三个消费页全迁，含本会话早前加的登出 epoch 守卫一并作废）。✅ creative-projects → use-creative-projects（列表/详情/创建/attach/detach 五个导出；7 个消费文件全迁）。✅ notifications ——按关注点拆分：服务端通知/未读数 → use-notifications（三查询组合：通知列表+模型目录+月度用量，本地合成通知派生自已缓存查询；已读变更 invalidate；SSE 事件直接 invalidate [notifications,list]，13 个消费方里 11 个只用的 showMessage 也不再自研——改走 shadcn sonner：main.tsx 原本已挂 Toaster 却闲置，与手写 GlobalMessage 并存；现已删 GlobalMessage/notifications-store，showMessage 收敛为 lib/message.ts 的 10 行 sonner 适配）。✅ generations → use-generations（列表 useInfiniteQuery 视图筛选进缓存键；详情 useQuery；**SSE 终接线**：事件/降级轮询全部 invalidate [generations]，降级轮询门控改为扫描查询缓存 hasActiveGenerationInCache）。**P0-C 正式关账（2026-08-29）**：四种手写服务端状态模式（版本计数/pending map/requestSeq/cancelled）全部消灭；web 仅存 auth/auth-dialog 两个纯客户端 zustand store + reference-assets 过渡 store（待 P0-A）→ 0d design-tokens 归口（P1-A）。
- **Batch 1 拆 app**（进行中）：✅ 第一步——`packages/app-shell` 认证层提取（auth-store/auth-dialog-store/幂等键工具/5 个认证页/守卫弹窗 + 各自测试）；**守卫解耦**：ProtectedRoute 不再内嵌 AppShell，改为纯 <Outlet/>（壳由各 app 组合——writer 用自己的编辑器壳）；lib-client 顺带吸收 message/toast 两个 sonner 适配；web 16 处导入重写、原件删除。✅ 第二步（2026-08-29）——**apps/writer 落地**：完整 Vite app（basename /writer、vite base /writer/、端口 5006、同款 Tailwind 主题与分包策略）；WriterShell 极简编辑器壳（顶栏写作/导演台入口，与 studio AppShell 零耦合）；登录/守卫/查询缓存清空全部来自 app-shell/lib-client（零复制）；WritingPage、DirectorPage、ScreenplayDocument、screenplay-format 已搬入。**过渡期双活**：DirectorProjectPage 依赖 assets 组件群暂留 web，writer 的 /director/:id 用占位页跳主站；web 的 /writing /director 路由暂不移除（等 nginx /writer 上线）。✅ 第三步（2026-08-29）——部署接线：nginx 增加 /writer location（镜像 /admin 模式：alias + SPA fallback + assets 一年 immutable，`nginx -t` 容器内验证通过）；Dockerfile 两个依赖阶段补齐 writer/ui/lib-client/app-shell 四个 manifest COPY（清单一致性门禁通过）、web-build 构建三前端、web 镜像新增 html-writer 产物层。✅ 第四步（2026-08-29）——**apps/web → apps/studio 改名**：目录重命名、包名 @bailian-studio/studio、Dockerfile/nginx/compose/边界规则/边界测试/清单测试全部同步更新。剩余：DirectorProjectPage 依赖共享化后迁入 writer + 上线 /writer 后移除 studio 侧 /writing /director 双活路由。
- **Batch 2 画布**（✅ 基础骨架 2026-08-29）：apps/canvas 完整落地——@xyflow/react v12 画布（Background/Controls/自定义节点/连线交互）+ MediaNode（Krea 式：empty→generating→ready/error 状态机，提示词+模型选择+参考图条+比例选择+产物预览）+ canvas-store（zustand + localStorage 持久化，节点/边/CRUD）+ CanvasShell（极简顶栏）+ 认证/查询缓存从 app-shell/lib-client 接入 + nginx /canvas location + Dockerfile 四前端构建。**✅ 已接真实生成（2026-08-29）**：MediaNode 发送按钮 → apiClient.createGeneration（幂等键 canvas:nodeId:timestamp）→ 3s 间隔轮询 getGeneration 直到终态 → succeeded 时拉 listGenerationArtifacts 提取 readUrl 展示产物。模型选择器从 useModelCatalog 动态填充（仅显示 enabled 模型）；比例五选一切换。后端 canvas 文档 API 仍待后半段。
- **Batch 3 剧本新流程**（实体审核 API ✅ 2026-08-29）：
  - ✅ DB schema：`director_entity_candidates` 表（kind/status/mentionsJson/provisional→accepted|rejected 状态机 + CHECK 约束 + 索引）+ 0057 迁移。
  - ✅ shared 契约：zod schema（DirectorEntityCandidateSchema/ListSchema/ReviewSchema）导出。
  - ✅ repository：listEntityCandidates（按 status/kind 过滤 + 项目归属校验）/ createEntityCandidates（批量）/ reviewEntityCandidate（accept/reject + reviewedBy）/ deleteEntityCandidate（软删除）；接受角色/场景候选时原子提升为导演实体，并以候选 ID 幂等。
  - ✅ API 路由：GET /projects/:id/entity-candidates + PATCH /entity-candidates/:candidateId + DELETE 同。错误码 DIRECTOR_ENTITY_CANDIDATE_NOT_FOUND → 404。
  - ✅ worker 实体提取 handler（2026-08-29）：`processEntitiesPhase` + `entityExtractionPrompt` + `parseEntityExtractionOutput`。
    - prompt：中文，要求 LLM 返回精确子串 mentions（服务端用 indexOf 校验）
    - 解析器（director-entities.ts）：tryParseJson（含 Markdown 围栏容错）→ normalizeKind → validateMentions（indexOf 精确匹配 + UTF-16 偏移计算 + 去重 + 长度上限 200）→ 全部 mention 无效的实体被过滤
  - handler：createGeneration → 3s 轮询 → 解析 → `createEntityCandidates` 持久化为 provisional → completePhase（outputSummary 含 entityCount + kindCounts）
  - 不走 runTextPhase 的原因：需要在 parse 与 complete 之间插入异步 createEntityCandidates
  - `entities` 阶段已注册到 DIRECTOR_PHASES（shared + worker dispatcher）
  - ✅ **Writer 实体审核页（2026-08-30）**：`apps/writer/src/pages/DirectorProjectPage.tsx` 接入项目详情、文本模型选择、实体提取阶段轮询、候选类型/状态筛选，以及 accept/reject/delete 审核操作；审核后会反馈角色/场景已进入导演实体。`packages/api-client` 补齐实体候选的 zod 响应契约与 typed client 方法。`/writer/director/:id` 不再跳回 Studio，后续分镜流程可在同一入口继续。
  - ✅ **分镜实体输入接线（2026-08-30）**：创建 storyboard phase run 时固化当前未过期的角色/场景导演实体快照；worker prompt 明确 `referenceKeys` 只能逐字引用这些实体名称，不自动绑定资产 ID。真实 PostgreSQL 集成测试覆盖快照内容。
  - ✅ **SSE 实体补丁（2026-08-30）**：实体审核/删除成功后通过现有用户 SSE 频道发送 `director.entities.changed`；Studio 与 Writer 只失效 director 查询，服务端数据仍以 API 为准，断线后由查询兜底。
  - ✅ **逐镜头导出（2026-08-30）**：视频阶段对每个拥有当前有效 `shot_video` 的镜头提供“下载本镜”；复用已有 owner-scoped 资产下载 URL，保留资产权限、签名与历史版本语义，不新增 ZIP 或替代成片合成。
- **Batch 4 模型层吸收**：
  - ✅ manifest examples 门禁（2026-08-29）：`ModelManifest.examples` 可选字段（valid/invalid + expectedCode + expectedField），`check:manifests` 对声明的样例真跑 `validateModelParams`——valid 必须零 issue 通过，invalid 必须产出声明的 expectedCode。首批 qwen-image（2 valid + 5 invalid）与 wanx-video（2 valid + 3 invalid）共 12 条样例全部通过。类型兼容 deepFreeze（readonly）。渐进迁移：未声明 examples 的 manifest 跳过不强制。
  - ✅ sourceRefs 漂移门禁（2026-08-29）：`ModelManifest.sourceRefs` 可选字段（paths + reviewedAtVersion）；check:manifests 读取 sync-state.json 对比官方文档版本——文档版本 > manifest 版本时输出漂移警告（警告级，不阻塞 CI，待全量 docs 同步后可升级为 fail）。首批示范：wanx-video → 万相2.7-文生视频.md v62。
  - ✅ parameterInventory 完整性断言（2026-08-29）：检查声明参数 ↔ request bindings 双向覆盖——**已抓到并修复 3 个真实 bug**（qwen-image-max 缺 n binding、两个 omni screenplay 的 mode 参数未标记 ui.only）。0 gaps 为通过条件（阻塞级）。
  - 待实现：uhyc 参数控件词汇（resolution/palette/shotList 控件提示）。
- **Batch 5 文档采集插件**（✅ 2026-08-29）：
  - ✅ `tools/local-doc-capture` 整体移植（Chrome MV3 扩展 + loopback server + 审阅台账 + 边界守卫脚本），124KB 自包含
  - ✅ `scripts/docs/model-sync-state.ts` 审阅台账移植
  - ✅ `scripts/verify-local-capture-boundary.ts` 边界守卫移植
  - ✅ **254 文档 complete 快照替换 partial**：`docs/bailian/official/` 从 101/238 partial → 254/254 complete（来自 reset 项目 2026-08-27 同步）
  - ✅ verify 函数兼容 reset 快照字段名（`importedAt` fallback `officialLastModifiedAt`）
  - ✅ `docs:bailian:snapshot:check` 通过：254 documents, latest update 2026-08-27
  - 注：新版 sync 脚本（linkedom 解析）因网络证书问题暂缓安装；当前快照已完整，sync 脚本仅在未来重新同步时需要
- **跨批**：excuse 的连续性 linter、[Image N]↔media[] 对齐 + R2V 参考预算、ffmpeg 超时包装器/BGM ducking。

### 各参考项目取用清单（结论存档）

- **bailian-studio-reset**：文档采集插件（高）、254 快照+新版 sync lib（高）、剧本语义分析子系统（高）、AI 导入规划/格式转换（中）、model-core 三层限制对账（中高）、canvas 幂等恢复/revision 并发模式（中）。
- **excuse**：三层流式反馈（高）、连续性规则引擎（高）、参考预算 prompt 对齐（高）、ffmpeg 包装器+BGM ducking（高）、产品思维文档当规范读（高）；12 阶段管线/20 包结构/计费/节点图 UI 跳过。
- **bailian-canvas**：MediaNode 交互骨架/ParamsDropdown/拖线生成节点/mockGenerate 夹具（高）；其余为 mock 原型。
- **puzzle-canvas**：分块续传上传（高）、canvasStore 拦截模式/分组瀑布布局（中）、分享快照（低中）。
- **bailian-hub**：三门禁吸收进 model-core（高）；发布仪式/跨仓 coverage 跳过（教训已吸收：git 即版本）。
- **bailian-studio-v3 / uhyc**：跳过（uhyc 仅参数控件词汇，见上）。

## 八、执行顺序建议

1. **本轮已完成**：第一批紧急修复 + bun + turbo 迁移 + schema 域拆分 + director 阶段骨架泛型化（P1-E）+ 共享包（ui/lib-client）+ admin 8 页 & web 9 个 store 全量 TanStack Query 迁移（P0-C 关账，SSE→invalidate 全接线）+ toast 统一 shadcn sonner。
2. **下一批（解锁后续一切）**：P1-F 测试补位（director store/hook + admin e2e）→ P0-C 服务端状态统一 → P0-A DirectorProjectPage 拆解。测试先行，重构才可验证。
3. **再下一批**：P0-B packages/ui + P1-A design-tokens 归口（一次样式体系收敛）。
4. **后端结构**：P1-C 任务队列 store 下沉 → P1-B/P1-I generation-repository 拆分 → P1-D 胖路由补 service 层（director 阶段运行已完成，creative asset 单次/批量收录、审计 outbox、管理员失败重放、Worker 最小指标契约和 Loki/Grafana 运营视图已完成，下一步验证告警阈值与 generation-repository 拆分）。
5. **数据层**：P1-H repository-kit → P1-J 审计枚举单一事实源 → P1-K 边界检查补全 → P1-G provider 拆分（第二个 provider 进场前完成）。
6. **P2 清单**随相关区域触碰时顺带处理，不单开分支。

---

### 审查基线快照（2026-08-29）

- 代码量：apps+packages 共 ~105k 行 TS/TSX；apps/web 23.3k、apps/admin 5.6k、generation-repository 7.9k+1.6k、model-core 9.1k（其中 6.5k 为 DashScope manifests）。
- 测试：147 个 vitest 文件（api 35 / worker 27 / web 18 / admin 2 / packages 44 / root+scripts 19）+ 1 个 e2e。
- 包依赖图无环；web/admin 无法触达 db/仓库层（边界检查器强制）；api 不触达 provider-dashscope/db。
- 亮点（校准用，非问题）：credit-ledger 行锁 + 幂等键 + 追加式账本 + 对账作业，未发现双花路径；任务认领 `FOR UPDATE SKIP LOCKED` + 僵尸租约回收 + 毒丸隔离；事务性 outbox + LISTEN/NOTIFY + Last-Event-ID 回放；部署脚本 SHA 不可变镜像 + 强制 verify + 预检脚本质量高。
