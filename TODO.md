# bl-studio · 技术债务与改进清单（TODO）

> 审查日期：2026-08-08
> 审查方法：6 个并行深度代码审查 + 交叉核对 —— 覆盖 `apps/api`、`apps/worker + provider-dashscope + task-engine`、`packages/model-core`（51 份 manifest）、`apps/web + apps/admin + api-client`、`packages/db + generation/media-repository + auth + credit-ledger + storage + event-bus`、`infra/scripts + CI + e2e + 测试 + 文档`。
> 全部条目均已核对到 `file:line`；标注「需核实」的项是证据链缺一环、需人工确认真实性。
> 严重度：🔴 **P0**（功能失效 / 数据丢失 / 计费错误 / 安全缺口）· 🟠 **P1**（明显缺陷、一致性、可靠性）· 🟡 **P2**（维护性 / 死代码 / 文档漂移）。

---

## 0. 最值得先修（Top 14）

| # | 严重度 | 问题 | 一句话修法 |
|---|---|---|---|
| 1 | 🔴 | [语音识别工具（ASR）参数名错误，每次提交必然失败](#p0-01) | FunctionsPage 改传 `assetRefs.fileUrls` |
| 2 | 🔴 | [重发验证邮件被掩码邮箱打断，按钮显示成功但什么都没发](#r2-p0-01) | register 响应用 displayEmail 分离真实邮箱 / 重发按 userId |
| 3 | 🔴 | [artifact.persist 永不重试，瞬时故障即永久丢产物（且已扣费）](#p0-02) | 仿 thumbnail 补 retry 分支 |
| 4 | 🔴 | [对比生成 `batchId` 在请求体被丢弃，分组功能端到端失效](#p0-03) | api-client 补一行 spread |
| 5 | 🔴 | [执行期 DB 异常把 generation 永久卡在 submitting，无恢复](#p0-04) | runTask catch 兜底 fail + 清扫器 |
| 6 | 🔴 | [chat/stream 提交无幂等保护，重试可重复计费](#p0-05) | 失败不重试 / 落库已收 usage |
| 7 | 🔴 | [schema ↔ 迁移链无对账，dev/test 用 push 掩盖生产漂移](#p0-06) | `db:generate` 入 verify + CI 改 migrate |
| 8 | 🔴 | [API 兜底错误把 message/cause 双路泄漏（响应 + 日志），且日志脱敏对 message 串/值侧无效](#r2-p0-03) | 兜底只回 `INTERNAL_ERROR`+traceId；日志错误文本截断 + 值级脱敏 |
| 9 | 🟠 | [剧本模型预检恒 0 分，架空每日成本上限](#p1-02) | 修量纲错配（per_second × token rates） |
| 10 | 🟠 | [列表「加载更多」后被任意全量刷新打回第一页](#p1-01) | refresh 改 merge 且保留 cursor |
| 11 | 🟠 | [reconcile/releaseStaleReservations 全表载入账本](#p1-06) | set-based / 游标分批 |
| 12 | 🟠 | [三个 P0 缺陷无回归测试 + admin 全 app 零测试被 passWithNoTests 掩盖](#r2-p1-09) | 补 batchId/artifact/ASR 回归用例；admin 测试破冰 |
| 13 | 🟠 | [e2e 被死端口 spec 打挂 + 不覆盖 SSE/资产闭环](#p1-38) | 修/删 5103 spec；补资产闭环用例 |
| 14 | 🟠 | [`verify` 开箱跑不了（需先手动加载 test env）](#p1-39) | 脚本前加 `dotenv -e infra/env/.env.test` |

---

## 1. 🔴 P0 —— 功能失效 / 数据丢失 / 计费 / 安全

<a name="p0-01"></a>
### P0-01 · 语音识别工具（ASR）参数名错误，功能必然不可用
> ✅ 已处理（commit `43e6b40` fix(worker)，2026-08-08）
- **位置**：[FunctionsPage.tsx:78](apps/web/src/pages/FunctionsPage.tsx#L78) 发 `{ audioUrl: asset.url ?? '' }`；[fun-asr.ts:30-38](packages/model-core/src/manifests/audio/fun-asr.ts#L30-L38) 唯一媒体参数是 `fileUrls`（`required:true`，映射到 `input.field.file_urls`）
- **问题**：manifest 根本没有 `audioUrl` 参数。服务端 `validateModelParams` 恒报 `UNKNOWN_PARAMETER(audioUrl)` + `REQUIRED_PARAMETER(fileUrls)`；全仓无 `audioUrl` 特判。
- **影响**：用户可点到的「语音识别」工具 100% 提交失败。
- **修法**：`runGeneration` 签名扩成可带 `assetRefs`，按 `{ fileUrls: [asset.id] }` 走资产引用提交；顺带修 ScreenplayTool/AsrTool 硬塞 `params: {}` 的模式。

<a name="p0-02"></a>
### P0-02 · artifact.persist 任务永不重试 —— 瞬时故障即永久丢产物
> ✅ 已处理（commit `43e6b40` fix(worker)，2026-08-08）
- **位置**：[artifact-task-handler.ts:61-74](apps/worker/src/artifact-task-handler.ts#L61-L74)（catch 无条件返回 `failed`）；[artifact-persist.ts:77-86](apps/worker/src/artifact-persist.ts#L77-L86)（单个 artifact 失败先 `markArtifactFailed` 再抛错）
- **问题**：`artifactErrorToTaskError` 判出的 `retriable`（artifact-persist.ts:159-167）从未被用于重试。下载抖动 / OSS 5xx 后 artifact 被永久标记 `failed`；`listPendingArtifactsForRecord`（repository.ts:2871）虽会捞回 `failed` artifact，但**没有路径为其重新入队**。
- **影响**：generation 已 `succeeded` 且已扣费，但用户拿不到产物。
- **修法**：仿 thumbnail 分支，`retriable && attempts < max` 时返回 `{ status: 'retry', nextRunAt }`；或加对 `failed` artifact 的兜底清扫。

<a name="p0-03"></a>
### P0-03 · 对比生成 `batchId` 在请求体被丢弃，分组功能端到端失效（已验证）
> ✅ 已处理（commit `43e6b40` fix(worker)，2026-08-08）
- **位置**：[generation-client.ts:678-684](packages/api-client/src/generation-client.ts#L678-L684)（body 组装漏掉 batchId）；[CreatePage.tsx:319](apps/web/src/pages/CreatePage.tsx#L319)（生成并传入 batchId）
- **问题**：后端全链路都支持 —— `shared/validation.ts:31` 有 `batchId`、API service 整包 spread、[repository.ts:1766](packages/generation-repository/src/repository.ts#L1766) 落库 —— 唯独 api-client 拼 body 时丢字段。
- **影响**：「同提示词多模型对比」永远无法按批次分组；DB 列恒空、索引浪费。
- **修法**：body 补 `...(input.batchId !== undefined ? { batchId: input.batchId } : {})`（一行）。

<a name="p0-04"></a>
### P0-04 · 执行期 DB 异常把 generation 永久卡在 `submitting`，无恢复
> ✅ 已处理（commit `43e6b40` fix(worker)，2026-08-08）
- **位置**：[worker-loop.ts:219-238](apps/worker/src/worker-loop.ts#L219-L238)（catch 只 `transitionTask(fail)` 不更新 record）；[generation-task-handler.ts:42](apps/worker/src/generation-task-handler.ts#L42)（`getGenerationRecord` 在 try 外）；[worker-loop.ts:375-382](apps/worker/src/worker-loop.ts#L375-L382)（`thrownToTaskError` 恒 `retriable:false`）
- **问题**：DB 抖动让 `getGenerationRecord`/`getGenerationInputAssets` 抛错 → 异常穿透到 worker-loop catch → task 永久 failed，record 停在 `submitting`；**无 sweeper**。med/thumbnail 任务不影响 record，唯独 generation 有。
- **影响**：积分预扣永不释放，用户看到的生成永远 pending。
- **修法**：runTask catch 里对 generation 任务尽力 `failGeneration`（转 record 失败 + 退款）；加「submitting/processing 超时（如 >30min）且任务已终态」的清扫。

<a name="p0-05"></a>
### P0-05 · chat/stream 提交无幂等保护，重试会重复计费
> ✅ 已处理（commit `43e6b40` fix(worker)，2026-08-08）
- **位置**：[generation-task-handler.ts:135-137](apps/worker/src/generation-task-handler.ts#L135-L137)（幂等 key 只在 `submit` 生成）；[dashscope-runner.ts:88-89](apps/worker/src/providers/dashscope-runner.ts#L88-L89)（`runChat` 无幂等头）；[client.ts:321-335](packages/provider-dashscope/src/client.ts#L321-L335)（chat 超时判 `retriable`）
- **问题**：请求超时/断流被判可重试，重发整条 prompt；provider 已处理但响应丢失 → 同一段 token 计费两次。异步 submit 有幂等 key 兜底，chat 完全没有。
- **修法**：stream 失败不重试（成本低直接 fail），或重试前把已收 usage/文本落库。

<a name="p0-06"></a>
### P0-06 · schema ↔ 迁移链无自动对账，dev/test 用 push 掩盖生产漂移（双 agent 交叉确认）
> ✅ 已处理（commit `72d5467` fix(infra)，2026-08-08）
- **位置**：[ci.yml:40](.github/workflows/ci.yml#L40)（`db:push:test`）、[package.json:23](package.json#L23)（verify 链无 DB 项）、`packages/db/drizzle/`（39 份迁移）
- **问题**：dev/test/CI 走 `drizzle-kit push`（按 schema.ts 现算 diff），生产只走 `migrate`（应用已提交迁移）。`verify` 没有任何一步对比 schema.ts 与迁移链，也没有 `generate` 强制门禁。
- **影响**：改了 schema.ts 忘跑 `drizzle-kit generate`，CI 照样绿、本地正常，生产部署后缺列/缺表。
- **修法**：补 `db:generate` 并把「schema↔最新迁移 diff 为空」纳入 verify；CI 至少把 `db:push:test` 换成 `db:migrate`，让 CI 覆盖 migrate 路径。`db:push` 标注为仅本地开发。

<a name="p0-07"></a>
### P0-07 · 备份单机同盘 + OSS 灾备默认关闭 —— 整机故障即丢数据
> ✅ 已处理（commit `72d5467` fix(infra)，2026-08-08）
- **位置**：[docker-compose.prod.yml:158-183](infra/docker/docker-compose.prod.yml#L158-L183)（backup 卷与 postgres 同宿主）；[backup-postgres.sh:32-44](infra/scripts/backup-postgres.sh#L32-L44)（`BACKUP_OSS_UPLOAD` 默认 false，ossutil 缺失时静默跳过）
- **影响**：共享机磁盘故障/误删卷时 DB 与备份一起消失，恢复路径为零。
- **修法**：生产默认开 OSS 灾备（或在 `check-production-env infra` 强制校验「已启用或已显式确认不启用」）；上传失败让备份任务标红（当前 `||` 只 echo 不影响退出码）。

<a name="p0-08"></a>
### P0-08 · 部署无自动 verify 门禁 + 无回滚自动化
> ✅ 已处理（commit `72d5467` fix(infra)，2026-08-08）
- **位置**：[deploy-prod.sh:11](infra/scripts/deploy-prod.sh#L11)（注释「请确保 verify 全绿」，非强制）；[docs/03-ops.md:86-99](docs/03-ops.md#L86-L99)（回滚是手抄步骤）
- **问题**：CI verify 只作用于推送 main 的 commit；本地未推送/分支 commit 可直接 `deploy:prod`。部署「滚动 up」非原子，中途失败无人自动回滚。
- **修法**：`deploy-prod.sh` 前置硬性 `pnpm run verify`；封装 `pnpm run deploy:rollback <sha>`（本质是 `BAILIAN_STUDIO_RELEASE_TAG=<旧sha> prod:up`，成本极低）。

---

## 2. 🟠 P1 —— 明显缺陷与一致性

### 2.1 前端（apps/web + apps/admin）

<a name="p1-01"></a>
### P1-01 · 列表「加载更多」后被任意全量刷新打回第一页
> ✅ 已处理（commit `6dd324e`）——generations refresh 改 merge+保留游标；assets load 刷新合并新首页，2026-08-08
- **位置**：[generations-store.ts:95-109](apps/web/src/stores/generations-store.ts#L95-L109)（`refresh()` 整表替换）；[use-generation-events.ts:77-82](apps/web/src/hooks/use-generation-events.ts#L77-L82)（降级轮询 10s 调 refresh）；[assets-store.ts:46-95](apps/web/src/stores/assets-store.ts#L46-L95)；[LibraryPage.tsx:45](apps/web/src/pages/LibraryPage.tsx#L45)（缩略图未就绪时 2s `load(force)`）
- **影响**：翻出 100 条后，只要存在活跃任务/缩略图未就绪，列表瞬间缩回第一页；创建提交后 `refreshGenerations()` 同样触发。
- **修法**：refresh 改 mergeRecords 且保留 nextCursor；Library 强刷走合并、不回退分页。

### P1-02 · 剧本理解模型（qwen-omni-screenplay*）提交前费用估算恒为 0 分（已验证）
> ✅ 已处理（commit `6dd324e`）——estimatePriceCents 对 token 费率保守下限 1 分；两个剧本 manifest pricing.unit 改 per_token（PricingUnit 枚举值），2026-08-08
- **位置**：[qwen-omni-screenplay.ts:79-125](packages/model-core/src/manifests/video/qwen-omni-screenplay.ts#L79-L125)（`unit:'per_second'`、`quantityKey:'estimatedDuration'`，但全部 rates 为 `unit:'token'`、`unitSize:1000000`）；[pricing.ts:104-116](packages/model-core/src/pricing.ts#L104-L116)（estimatePriceCents 以 quantity×每 token 分）
- **问题**：量纲错配 —— 60「秒」× per-token 费率（≈0.004 分/token）≈ 0.24 分，被 `Math.round` 成 0；且 `mode` 参数被 applyDefaults 删除后 rate 条件永不命中，回退 `pool[0]`。
- **影响**：`enforceDailyGenerationLimits`（service.ts:105）按 `costEstimate` 累加，这两个模型的日限额形同虚设；用户侧预检显示「约 ¥0.00」。**实际结算是对的，只有预检错。**
- **修法**：token 型模型不以秒为 quantityKey —— 预检 quantity 改为折算 token 上限，或对 token+per_second 组合给保守下限。

### P1-03 · 未分类错误把 `error.message` / `error.cause.message` 原样回传客户端
> ✅ 已处理（commit `0b8689e` fix(security)——与 R2-P0-03 同一修复，2026-08-08）
- **位置**：[http-errors.ts:190-194](apps/api/src/lib/http-errors.ts#L190-L194)
- **问题**：裸 `Error`（未包装成领域错误）会把 message 甚至 cause.message（DB/存储/ffprobe 底层原文）放进 HTTP 响应；日志侧却刻意脱敏（app.ts:143）。日志脱敏与响应脱敏不一致，且与 api-client 契约注释「cause 是已清洗字符串」（schemas.ts:463）矛盾。
- **影响**：一次触发裸错误的请求可拿到 DB 报错、存储桶名、内部文件路径、ffprobe 命令行。
- **修法**：未分类错误对客户端只回 `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }`，细节只写服务端日志（配 traceId）。

### P1-04 · 生成详情页不随 SSE 更新
- **位置**：[GenerationDetailPage.tsx:36-49](apps/web/src/pages/GenerationDetailPage.tsx#L36-L49)（record 是本地 state，仅 mount 拉一次）
- **影响**：页面开着时 queued→succeeded 全程 UI 不动，需手动刷新。
- **修法**：详情页从 store `records` 取（`records.find(id)`），或 SSE 回写后 setRecord。

### P1-05 · 任务筛选 ToggleGroup 永远不显示选中态
- **位置**：[GenerationsPanel.tsx:158](apps/web/src/components/generations/GenerationsPanel.tsx#L158)（未传 `value`）；[GenerationStatusFilter.tsx:13-25](apps/web/src/components/generations/GenerationStatusFilter.tsx#L13-L25)（`value=[]` 默认）
- **影响**：筛选确实生效（store 被更新），但按钮被复位，用户误以为没生效。
- **修法**：PageVariant 读 `viewFilters` 传入 `value`。

### P1-06 · 提示词库存取 provider 语法，参考图引用丢失
- **位置**：[GenerationDetailPage.tsx:140](apps/web/src/pages/GenerationDetailPage.tsx#L140)（存 `<<<image_1>>>` 形态）；[PromptsPage.tsx:131](apps/web/src/pages/PromptsPage.tsx#L131)（复用深链回填）
- **影响**：保存/复用后编辑器显示 provider 语法原文、参考图引用失效（表单里是 `@图N` 中性标记）。
- **修法**：入库存 `@图N` 中性标记（反解析）或原始表单值；复用前做 marker 还原。

### P1-07 · 幂等指纹缓存不随登出清理（跨用户串 key 窗口）
- **位置**：[idempotency.ts:35-36](apps/web/src/lib/idempotency.ts#L35-L36)（模块级 `fingerprintToKey` Map，未注册进 `registerPrivateDataReset`）
- **影响**：共用机器时用户 A 提交失败 → 登出 → 用户 B 提交相同 payload 复用同一 idempotencyKey，服务端冲突或命中 A 的记录。正是 resetPrivateData 注册表要防的跨用户残留。
- **修法**：登出/登出全部设备时清空 `fingerprintToKey`。

### P1-08 · 管理后台用户列表无请求序号防竞态
- **位置**：[UserListPage.tsx:57-71](apps/admin/src/pages/UserListPage.tsx#L57-L71)（`load` 无 seq guard；FeedbackPage/GalleryManagePage 都有，此处是遗漏）
- **影响**：快速改搜索词时旧响应晚到覆盖新结果，并清空已勾选项。
- **修法**：加 `requestSeq` 守卫。

### P1-09 · 积分展示单位不一致（admin）
- **位置**：[UserDetailPage.tsx:212-220](apps/admin/src/pages/UserDetailPage.tsx#L212-L220)（`availableCents/100` 标「积分」）
- **影响**：数量级差 100 倍，管理员易误判误操作（与「1 元=100 积分」弹窗口径冲突）。
- **修法**：统一口径 —— 显示分不除 100，或标签改「余额（元）」且弹窗同步。

### P1-10 · useMediaJob 无退避/无最大重试，jobId 置空不清理旧状态
- **位置**：[use-media-job.ts:26-39](apps/web/src/hooks/use-media-job.ts#L26-L39)（失败/非终态一律 1.5s 重试无上限）；[:21-22](apps/web/src/hooks/use-media-job.ts#L21-L22)（jobId 变 undefined 时直接 return）
- **影响**：永久失败任务每 1.5s 打一次请求；重选素材后 UI 残留过期 job。
- **修法**：加最大重试/指数退避；jobId 变 undefined 时 setJob(null)。

### P1-11 · 登录回跳 cb 未过 `resolvePostLoginRedirect`，写好的防御是死代码
- **位置**：[LoginPage.tsx:57](apps/web/src/pages/auth/LoginPage.tsx#L57)、[AuthDialog.tsx:41](apps/web/src/components/auth/AuthDialog.tsx#L41)（均 `navigate(callback ?? '/create')`）；[auth-dialog-store.ts:5](apps/web/src/stores/auth-dialog-store.ts#L5) 注释宣称「已安全校验」
- **问题**：`packages/api-client/src/auth-callback.ts` 的 `isAllowedCallback`/`resolvePostLoginRedirect` 有测试但全仓零调用。AuthDialog 的 callback 实际恒为 null，「登录回跳」流程本身不工作。
- **修法**：两处统一走 `resolvePostLoginRedirect(callback) ?? '/create'`；接线或删注释。

### P1-12 · 详情页硬编码模型 id / 尺寸魔法数
- **位置**：[GenerationDetailPage.tsx:573,579](apps/web/src/pages/GenerationDetailPage.tsx#L573)（`qwen-image-edit`）、[:527](apps/web/src/pages/GenerationDetailPage.tsx#L527)（`asset_generation_` 前缀）、[:528](apps/web/src/pages/GenerationDetailPage.tsx#L528)（`size:'2048*2048'`）；[FunctionsPage.tsx:16-17](apps/web/src/pages/FunctionsPage.tsx#L16-L17)（SCREENPLAY/ASR 模型 id）
- **影响**：绕过 manifest 单一数据源；模型下线/改名后出现死入口。
- **修法**：编辑入口按 capabilities 从 catalog 派生；镜像 id 前缀抽常量或由后端产物字段返回。

### P1-13 · 管理后台登录错误用原始 `err.message`
- **位置**：[LoginPage.tsx:27](apps/admin/src/pages/LoginPage.tsx#L27) + store 的 `lastError` 同样原始 message
- **影响**：未走 `user-error.ts` 映射，ApiClientError 原始 message 可能含内部信息；文案不一致。
- **修法**：`setError(userErrorMessage(err))`。

### P1-14 · 详情页 ParamsCard effect 每渲染重跑
- **位置**：[GenerationDetailPage.tsx:596,607-616](apps/web/src/pages/GenerationDetailPage.tsx#L596)（`record.assetRefs ?? {}` 每渲染新对象 → `refIds` memo 变 → effect 每次渲染重跑 `loadModels()`）
- **修法**：`assetRefs ??` 用模块级空常量。

### P1-15 · 管理后台用户详情资产仅前 50 条，无分页
- **位置**：[UserDetailPage.tsx:228](apps/admin/src/pages/UserDetailPage.tsx#L228)
- **影响**：大账户资产无法完整审计。
- **修法**：加翻页或「加载更多」。

### 2.2 API 层

### P1-16 · 上传把整个文件读进内存 + MIME 只信客户端声明
- **位置**：[assets/service.ts:96-115](apps/api/src/modules/assets/service.ts#L96-L115)（`Buffer.from(await file.arrayBuffer())` + 只判 `file.type`）；[auth/routes.ts:332-342](apps/api/src/modules/auth/routes.ts#L332-L342)（头像 2MB 同理）
- **问题**：`maxAssetSizeBytes` 默认 100MB、multipart 上限 120MB，但 `arrayBuffer()` 一次性载入进程内存；只信客户端 Content-Type，从不校验魔数。
- **影响**：并发上传即可 OOM；「image/png」可实际装载任意内容。`nosniff` + OSS 独立域缓解了存储型 XSS，但滥用面仍在。
- **修法**：改流式 `pipeTo` 存储适配器（不要 arrayBuffer）；对媒体做魔数二次校验（PNG/JPEG/WebP/MP4 头）。

### P1-17 · SSE 重连回放硬编码 limit=500 且不翻页
- **位置**：[generations/routes.ts:158-172](apps/api/src/modules/generations/routes.ts#L158-L172)
- **问题**：带 `Last-Event-ID` 只拉一次 500 条；断线期间 >500 事件即永久丢失，且 `.catch(() => {})` 静默吞掉。次级问题：`EVENT_CURSOR_EXPIRED`(410) 时浏览器 EventSource 读不到响应体，会带同一 Last-Event-ID 无限重试。
- **修法**：回放循环翻页追平到最新游标；410 时返回终止重试的信号（close 连接让前端 refetch）。

### P1-18 · 社区写端点整体豁免限流 + trustProxy 信任 XFF 首跳
- **位置**：[rate-limit.ts:106-113,125,139-146](apps/api/src/lib/rate-limit.ts#L106-L113)（gallery/prompt-library/feedback 写请求不参与限流，注释声明为有意）
- **影响**：点赞/收藏/提示词入库/反馈提交无频率限制，可被脚本批量刷，且每条点赞/收藏还写社交通知并触发 SSE，形成通知洪泛面；XFF 首跳若未被 nginx 覆写即可伪造绕过其它桶（**需核实**生产 nginx 是否覆写）。
- **修法**：社区写端点补低频 per-IP/per-user 桶（30~60 次/分）；`clientIdentity` 用 nginx 覆写后的 XFF 或按会话 userId 计数。

### P1-19 · 批量操作的结果与真实状态不符
- **位置**：[admin/routes.ts:271,288,306](apps/api/src/modules/admin/routes.ts#L271)（`affected: targets.length` 返回请求目标数而非实际翻牌行数）；[:323-341](apps/api/src/modules/admin/routes.ts#L323)（`batch-grant-points` 用 `Promise.all`，任一失败 → 整体 500 + 审计记 failed，但已成功用户已入账）
- **修法**：repository 批量语句返回 `rowCount`；grant 逐用户 try/catch 返回 `{ granted, failed }`。

### P1-20 · 畸形会话 cookie 触发 URIError → 500 而非「未登录」
- **位置**：[cookies.ts:28](apps/api/src/modules/auth/cookies.ts#L28)（`decodeURIComponent` 无 try/catch）
- **影响**：任何带 `%zz` 等非法转义的 cookie 在受保护路由上 500（本应 401），并顺带触发 P1-03 的 message 泄漏。
- **修法**：捕获后按无 cookie 处理。

### P1-21 · `env.ts` 默认 `AUTH_PUBLIC_WEB_ORIGIN=5004`，web dev 实际在 5002
- **位置**：[env.ts:35-37](apps/api/src/lib/env.ts#L35-L37)；该值驱动 GitHub OAuth `callbackUrl`（index.ts:108）
- **影响**：本地未设环境变量时 GitHub 登录回调指向不存在的 5004，OAuth 失效（开发期坑，不触生产）。
- **修法**：回退值改 `http://localhost:5002`。

### 2.3 Worker / 执行层

### P1-22 · submit 后锁丢失 → 重复 submit → poll 任务指数增长
- **位置**：[generation-task-handler.ts:124,282-297](apps/worker/src/generation-task-handler.ts#L124)；[repository.ts:2195-2242](packages/generation-repository/src/repository.ts#L2195-L2242)
- **问题**：submit 已提交、但 poll 任务未存 succeeded 时崩溃/锁过期 → task 重认领 → `providerTaskId` 取 undefined → 重新 submit → 再插一条 poll。多 worker 下 poll 各自再调度，任务数成倍增长。幂等窗口过期后还会真实产生第二个 provider 任务 → 双份成本。
- **修法**：submit 重跑时若 `record.providerTaskId` 已存在则转 poll 续跑；`scheduleGenerationPoll` 插入前查重（唯一性约束）。

### P1-23 · 仓库层异常被误分类为 retriable → 重跑 provider 执行
- **位置**：[provider-error-mapping.ts:22-28](apps/worker/src/provider-error-mapping.ts#L22-L28)；[errors.ts:101](packages/provider-dashscope/src/errors.ts#L101)（未知错误一律 `retriable:true`）
- **影响**：「provider 已执行成功、只是本地结算/持久化失败」被误判成值得重试 → 对同步模型再次执行 provider 生成，依赖幂等 key 才不重复计费。
- **修法**：显式区分错误来源 —— 仓库/账本/存储层错误归 `system` 并「记录失败+退款」而非「重跑 provider」；可重试只针对 provider 传输层。

### P1-24 · 超时从 createdAt 起算，包含排队时间 → 负载下假超时
- **位置**：[generation-task-handler.ts:78](apps/worker/src/generation-task-handler.ts#L78)、[artifact-task-handler.ts:25](apps/worker/src/artifact-task-handler.ts#L25)
- **影响**：队列积压时任务还没轮到就被判超时失败，放大故障。
- **修法**：改从 `startedAt`（认领时间）起算。

### P1-25 · ffmpeg stderr 全量缓冲进内存 + kill 不带进程组
- **位置**：[media-processor.ts:131](apps/worker/src/media-processor.ts#L131)（`new Response(proc.stderr).text()`）、[:134](apps/worker/src/media-processor.ts#L134)（`proc.kill()`）
- **影响**：异常媒体文件输出大量 stderr → 内存无界增长；超时只杀主进程，遗留子进程/线程。
- **修法**：stderr 滚动保留尾部 N KB；kill 升级 `SIGTERM → SIGKILL` 或 detached 独立进程组。

### P1-26 · 单 worker 进程单任务串行，无并发能力
- **位置**：[worker-loop.ts:189-206](apps/worker/src/worker-loop.ts#L189-L206)（每次认领 1 条跑完再认领下一条）
- **影响**：视频模型单条 10-30min，期间该进程只服务一条任务，吞吐受限；部署侧无多 worker 配置证据。
- **修法**：加有界并发（认领 N 条并行，锁/心跳已具备并发安全前提），或文档化「按进程扩容」并给出配置。

### 2.4 数据层 / 账务 / 认证

### P1-27 · credit-ledger reconcile / releaseStaleReservations 全表载入 + 长事务逐行加锁
> ✅ 已处理（commit `e68b239`）——账本 set-based 化 + worker 接线：reconcile 每账户最新快照改 ROW_NUMBER 窗口函数原生 SQL（drizzle 0.45 已移除 distinctOn）、负余额 SQL WHERE 过滤，内存 O(全部条目)→O(账户+异常)；releaseStaleReservations 候选判定下推 SQL（kind=reserve + 超时 + 终态 + NOT EXISTS settle/refund）。worker 组合根 createCreditLedgerFromUrl 创建账本句柄传入 WorkerLoop，startStaleReserveSweeper 以 stale-generation 同节奏周期调用 releaseStaleReservations({ olderThan: 1h, confirm: true }) 兜底释放僵尸 reserve（即「关联」里"无任何调用方"已解决）；creditHandle.close() 随 shutdown finally 关闭。
- **位置**：[credit-ledger/src/repository.ts:412-416](packages/credit-ledger/src/repository.ts#L412-L416)（reconcile 全表载入）、[:478-483](packages/credit-ledger/src/repository.ts#L478-L483)（releaseStaleReservations 全表拉一遍建已结算集合）、[:504](packages/credit-ledger/src/repository.ts#L504)（逐行 FOR UPDATE）
- **影响**：账本无界增长后每次清扫 O(全部条目) 内存，单事务锁大量 account 行，与并发结算互相阻塞/死锁，可能 OOM。
- **修法**：set-based —— 一条 `SELECT DISTINCT generation_id WHERE kind IN ('settle','refund')` 取代全表加载，`NOT EXISTS` 下推或按 account 分批。
- **关联**：`releaseStaleReservations` 目前**无任何调用方**（见 P2-07）—— 崩溃后既未 settle 也未 refund 的 reserve 永远不会被释放。

### P1-28 · login 计时侧信道 + 未验证邮箱可枚举
> ✅ 已处理（commit `2feafde`）——login 对不存在邮箱也跑 DUMMY_PASSWORD_HASH（argon2id 固定哈希，参数与真实一致）抹平计时；未验证/不存在/密码错误统一返回 AUTH_INVALID_CREDENTIALS（HTTP 401），不再发 AUTH_EMAIL_UNVERIFIED。
- **位置**：[auth/src/service.ts:491-496](packages/auth/src/service.ts#L491-L496)
- **问题**：用户不存在时短路不跑 argon2（快速失败）；login 对未验证返回 `AUTH_EMAIL_UNVERIFIED`、对不存在返回 `AUTH_INVALID_CREDENTIALS`。resend 接口（:472）统一 `accepted:true` 防枚举是对的，login 反而不对。
- **修法**：不存在时对固定 dummy hash 也跑 verifyPassword 抹平时间；login 对未验证与不存在返回同一错误。

### P1-29 · outbox SSE 无兜底轮询，NOTIFY 丢失即实时事件延迟
- **位置**：[event-listener.ts:44-60](packages/generation-repository/src/event-listener.ts#L44-L60)（只 LISTEN）；[notify.ts:37-53](packages/generation-repository/src/notify.ts#L37-L53)（pg_notify 即发即弃）
- **问题**：Postgres NOTIFY 在无人 LISTEN 时直接丢弃；API 的 LISTEN 短暂断开的窗口内状态变更不补发。Last-Event-ID 追平只覆盖客户端→API，覆盖不了 API→hub 这一段（**需核实** API hub 是否有周期 catch-up）。
- **修法**：加周期轮询兜底（如每 5-10s 自上次已见 id 追平），或 LISTEN 重连时强制追平。

### P1-30 · failMediaJob 无终态守卫，可把 succeeded 覆盖为 failed
- **位置**：[media-repository/src/repository.ts:313-330](packages/media-repository/src/repository.ts#L313-L330)（无条件 UPDATE）；同文件 completeMediaJob（:263-269）有完整守卫，两侧不对称
- **修法**：UPDATE 加 `status NOT IN ('succeeded','cancelled')` 条件 + returning。

### P1-31 · claimNextQueuedTask 的 ORDER BY 无索引支撑（热路径排序）
- **位置**：[repository.ts:3005-3016](packages/generation-repository/src/repository.ts#L3005-L3016)；[schema.ts:701](packages/db/src/schema.ts#L701)（`task_records_queue_idx` 与排序方向不符）
- **修法**：加 `(priority DESC, created_at) WHERE status='queued'` partial index。

### P1-32 · outbox 触发器 DDL 游离于迁移之外
- **位置**：[notify.ts:13-77](packages/generation-repository/src/notify.ts#L13-L77)；39 个迁移均无 trigger DDL（已 grep 确认）
- **问题**：`append_generation_status_event`/`notify_generation_events` 只在 API 启动钩子 `ensureGenerationEventsTrigger` 安装；纯 migrate 环境无触发器，API 角色若降权则启动失败。
- **修法**：触发器 DDL 收敛进迁移，启动钩子保留为幂等 ensure 兜底。

### P1-33 · OSS 适配器不清理 key 且 expires 不夹紧
- **位置**：[storage/src/oss.ts:61-67](packages/storage/src/oss.ts#L61-L67)（resolveWriteKey 只加前缀）、[:93-99](packages/storage/src/oss.ts#L93-L99)（原样 expires）；对比 [local.ts:98-129](packages/storage/src/local.ts#L98-L129)（sanitizeKey 拒绝 `:`/`..`/前导 `/`）
- **影响**：若上游把外部输入塞进 storage key，对象 key 注入/绕过前缀；过大的 expires 生成长期有效签名 URL。当前 key 均由内部 id 生成，触发面小。
- **修法**：统一复用 sanitizeKey 语义；expires 夹紧到 [1, 7×86400]。

### 2.5 模型知识（model-core）

### P1-34 · fun-music prompt 必填与 required-one-of 规则自相矛盾
- **位置**：[fun-music.ts:24](packages/model-core/src/manifests/audio/fun-music.ts#L24)（`prompt required:true`）vs [:80-86](packages/model-core/src/manifests/audio/fun-music.ts#L80-L86)（`required-one-of [lyrics, prompt]`）
- **影响**：官方允许「仅歌词」提交，此处必被 `REQUIRED_PARAMETER(prompt)` 拒绝；规则与文案形成错误引导。
- **修法**：去掉 prompt 的 `required:true`（二选一语义以规则为准），补「仅 lyrics」回归测试。

### P1-35 · subModeOf 把视频理解模型归类为「视频编辑」，主创建页可触达
- **位置**：[model-modes.ts:44-59](apps/web/src/lib/model-modes.ts#L44-L59)（`video_input` → `vedit`）；SubMode 无 `understand`
- **影响**：qwen-omni-screenplay/-flash（启用状态）出现在视频编辑子模式，与真正编辑模型混列；用户按编辑模型选择会拿到文本剧本而非视频。
- **修法**：SubMode 增加 `understand`（或独立分组），剧本类 capabilities 先行归类；至少从 vedit 排除。

### P1-36 · qwen-image-2 头注释价格与 manifest rates 矛盾（需核实）
- **位置**：[qwen-image-2.ts:6-9](packages/model-core/src/manifests/image/qwen-image-2.ts#L6-L9)（注释 0.20/0.25/0.15 元）vs [:112/:230/:348](packages/model-core/src/manifests/image/qwen-image-2.ts#L112)（rates 实为 0.5/0.5/0.2 元）
- **影响**：若 rates 是错的一方 → 真实资金影响；若注释是错的一方 → 误导维护。
- **修法**：对照百炼官方价格页核对，把官方价格写进注释并标注核验日期。

### P1-37 · 「新增模型 = 只改 manifest」声明不完全成立，多个硬编码消费者
- **位置**：[FunctionsPage.tsx:16-17](apps/web/src/pages/FunctionsPage.tsx#L16-L17)、[chat-builder.ts](packages/provider-dashscope/src/chat-builder.ts)（buildScreenplayPrompt 硬编码）、[pricing.ts:170-172](packages/model-core/src/pricing.ts#L170-L172)（token 桶→conditions.mode 映射硬编码）、[model-modes.ts:14](apps/web/src/lib/model-modes.ts#L14)（无 understand）
- **影响**：新增剧本类/ASR 类模型仍需改 4 处非 manifest 代码，漏改一处即静默错配（FunctionsPage 的 `find(Boolean)` 只取第一个）。
- **修法**：把「剧本流/ASR 流」能力判定下沉到 manifest capabilities（如新增 `screenplay` capability），按 capability 分发。

### 2.6 工程化 / CI / 运维

### P1-38 · e2e 被死端口 spec 打挂 + 不覆盖 SSE/资产闭环 — ✅ 已处理（2026-08-08）
- **位置**：[account-assets.spec.ts:10](e2e/legacy-vue/account-assets.spec.ts#L10)（`apiOrigin='http://127.0.0.1:5103'`，全仓无进程监听）；[playwright.config.ts](e2e/playwright.config.ts)（webServer 用 5003）；[workbench.spec.ts:3-30](e2e/legacy-vue/workbench.spec.ts#L3-L30)（只到「任务 queued」）
- **问题**：`pnpm run e2e` 必然失败；该 spec 是 Vue 时代遗留未随 React 重写迁移。e2e 不启 worker、无 SSE/产物断言 —— 队列消费→SSE→资产落库这条最关键链路无自动化兜底。
- **修法**：改 5003 或归档遗留 spec；补一条「seeded 用户 + succeeded generation + 真实 API」的资产闭环断言；把 e2e 挂进 CI 独立 job。
- **处理**：① 两个 Vue 时代浏览器 spec（account-assets / workbench，均依赖已消失的 `data-testid`/路由/文案，与 React 重写完全脱节）归档到 [e2e/legacy-vue/](e2e/legacy-vue/)，[playwright.config.ts](e2e/playwright.config.ts) 加 `testIgnore: 'legacy-vue/**'`；② 新增 [asset-loop.spec.ts](e2e/asset-loop.spec.ts)：**纯 API 驱动**（request fixture，无需浏览器）的真实资产闭环——seeded 用户登录 → `POST /api/assets/upload` 传真实图片 → `POST /api/generations` 以 `assetRefs.image` 引用（断言媒体引用不残留进 inputParams）→ DB seed `succeeded` 状态 + 产物（`status='stored'`）+ 生成资产 → 真实 API 断言产物可列出出 signed URL、生成资产进资产库（source='generation'）、登出后 `/api/assets` 与 `/api/generations/:id` 均 401；③ [ci.yml](.github/workflows/ci.yml) 新增独立 `e2e` job（`needs: verify`，`setup-bun` + migrate + playwright，走 migrate 而非 `pnpm run e2e` 的 push 路径）。本地 `1 passed`，清理后无残留行。

### P1-39 · `verify`/`test` 不自动加载 test env，开箱跑不了 — ✅ 已处理（2026-08-08）
- **位置**：[package.json:20-23](package.json#L20-L23)（无 dotenv 前缀）；[test-utils.ts:31-33](packages/db/src/test-utils.ts#L31-L33)（`requireDatabaseUrl` 缺失即抛）
- **影响**：新环境 `pnpm install && db:test:up && pnpm run verify` 直接报 `DATABASE_URL is required`，与 CLAUDE.md 观感不符（memory 已确认此坑）。
- **修法**：`test`/`test:root`/`test:coverage`/`verify` 改为 `dotenv -e infra/env/.env.test -- sh -c '…'` 包裹整条链（与 `dev` 同款）；CI 已有 env 不受影响。**坑**：`dotenv -- A && B` 只给 A 加载 env，`&&` 后的 B 跑的是父 shell 的 env（无 DATABASE_URL）——必须用 `sh -c` 包住全链。附带修复：P1-28 在 [auth-routes.test.ts:171](apps/api/tests/auth-routes.test.ts#L171) 的回归断言（未验证邮箱登录改 401 + AUTH_INVALID_CREDENTIALS）。

### P1-40 · 包边界检查覆盖面缺口：web/admin/api-client/storage 等无规则
- **位置**：[check-package-boundaries.ts:112-224](infra/scripts/check-package-boundaries.ts#L112-L224)（规则只覆盖 12 个 scope）
- **影响**：CLAUDE.md 声称「运行时应用禁止直接 import `@bailian-studio/db`」，但 `apps/web`/`apps/admin` 无任何规则；api-client/storage/design-tokens/provider-health 完全不在规则表里。未来误 import 不会被拦，架构约束名存实亡。
- **修法**：为 web/admin 补 `@bailian-studio/db` 等禁入规则，并补对应测试断言。

### P1-41 · deploy 公网冒烟在本机 curl，受 Clash fake-ip DNS 污染
- **位置**：[deploy-prod.sh:168](infra/scripts/deploy-prod.sh#L168)（`curl https://$SITE_DOMAIN/api/health/ready`）
- **问题**：手册自己强调「本地 dig 不可信、查 DNS 在服务器上」，最后一道冒烟却在本机走本机解析。
- **修法**：用 `curl --resolve "$SITE_DOMAIN:443:<服务器IP>"`，或把冒烟放到服务器上 `ssh_cmd` 执行。

### P1-42 · `db:push` 永久挂 6 个 backfill + 其中个别是破坏性 UPDATE
- **位置**：[package.json:39](package.json#L39)（6 个 backfill 链）；[backfill-generated-assets.ts:13-22](infra/scripts/backfill-generated-assets.ts#L13-L22)（每次 push 把 `source='generation'` 的 original_url/storage_url 置 NULL）
- **影响**：反复 push 重复清空生成资产上可能由应用写入的 URL；CI 每次全表扫描。迁移与「push 后自动化」边界混乱。
- **修法**：一次性数据修正收敛进真正迁移，`db:push` 只留 schema push + ensure-audit-constraint。

### P1-43 · `.dockerignore` 漏掉 `.env.prod-infra`
- **位置**：[.dockerignore:15-19](.dockerignore#L15-L19)
- **影响**：`infra/env/.env.prod-infra`（含 POSTGRES_PASSWORD、GRAFANA_ADMIN_PASSWORD、DEPLOY_SSH_KEY 路径）会进入 Docker build context（当前 Dockerfile 未 COPY 故不进镜像层，但属潜在泄漏路径）。
- **修法**：`.dockerignore` 增加 `.env.prod-infra`（或 `.env*` 通配兜底）。

### P1-44 · 审计动作约束四处手写、无自动一致性检查
- **位置**：[audit-types.ts:7](packages/generation-repository/src/audit-types.ts#L7)、[schema.ts:156](packages/db/src/schema.ts#L156)、[ensure-audit-action-constraint.ts:15-62](infra/scripts/ensure-audit-action-constraint.ts#L15-L62)、10 个迁移内嵌 CHECK 列表
- **问题**：当前 41 个动作三方一致（已核实），但**没有任何测试**比对它们；新增 audit action 漏改一处即漂移。
- **修法**：写测试从 `audit-types.ts` 类型联合推导字符串集，与 schema.ts CHECK 及脚本内嵌列表逐项比对，纳入 verify。ADD 改 `NOT VALID` + `VALIDATE CONSTRAINT` 避免整表 ACCESS EXCLUSIVE。

---

## 3. 🟡 P2 —— 维护性 / 死代码 / 文档漂移

### Worker / 执行层
- **P2-01 · provider-health 包完全未接线（死代码）** — ✅ 已处理（2026-08-08，选择删除）——全仓 grep 无任何消费方；降级策略概念已被 manifest `availability`（enabled/notActivated「暂未开通」）+ 逐任务重试（P2-02/06）替代。整个 `packages/provider-health/` 删除，同步清理：pnpm-lock.yaml（pnpm install 重生成）、infra/docker/Dockerfile 两处 COPY、README.md 与 docs/01-assessment.md 包列表、CLAUDE.md 包表（其描述「健康探测」本就与真实内容「circuit-breaker」不符）。边界/typecheck 通过。
- **P2-02 · 未知错误兜底一律判 retriable** — ✅ 已处理（2026-08-08）——[errors.ts:104](packages/provider-dashscope/src/errors.ts#L104) 兜底改为 `system` 不可重试；同时在兜底前显式识别未包装的网络故障字面（fetch failed / ECONNRESET / ENOTFOUND / getaddrinfo…）为 network 可重试——避免把瞬时网络抖动判成永久失败（task-executor「retries a submit-stage exception even without a providerTaskId」测试守住该契约）。网络/超时/429/5xx/408 都在状态码或关键词层先被标成可重试，兜底只剩代码 bug/未识别 4xx/畸形响应。
- **P2-03 · 退避算法两处实现不一致** — ✅ 已处理（2026-08-08）——generation-task-handler 与 artifact-task-handler 各自的 `backoffRunAt`（`1000*2**attempt` 上限 60s）删除，统一走 task-engine `nextRunAt(now, attempt)`（base 1s、上限 30s）；thumbnail 本就走 task-engine，全仓唯一实现。`shiftMs` 随删。
- **P2-04 · artifact-fetch DNS rebinding TOCTOU** — ✅ 已处理（2026-08-08，标注）——[artifact-fetch.ts:358](apps/worker/src/artifact-fetch.ts#L358) fetch 调用处补注释：validateUrl 主机名校验与 fetch 各做一次 DNS 解析存在 TOCTOU 窗口，白名单 + 拒绝 IP 字面量已缩小面但未做「解析后 IP 固定」；产物 URL 来自受信 DashScope 结果域、暂不在 SSRF 威胁面内，升级时再收口。
- **P2-05 · 损坏的 task 行毒化整个 worker loop** — ✅ 已处理（2026-08-08）——[repository.ts:3071](packages/generation-repository/src/repository.ts#L3071) `claimNextQueuedTask` 内 `toTaskRecord`+`transitionTask('claim')` 包 try/catch：确定性抛错（type/domain 配对错、非法状态）时在同一事务里把该行强制置为 `failed`（errorJson `TASK_CLAIM_INVALID` 携带原错误），返回 undefined；毒行终态化、永不再被选中，排在后面的健康任务照常消费。DB 写入错误仍在事务外抛、交给外层退避。测试：repository.test.ts「force-fails a corrupt task row on claim instead of poisoning the loop」。
- **P2-06 · thumbnail/media 对瞬时失败无有效重试** — ✅ 已处理（2026-08-08）——新增 [transient-error.ts](apps/worker/src/transient-error.ts) 共享分类器（网络/超时/OSS 节流/5xx），thumbnail 的 `thumbnailErrorFromThrown` 正则与 media 的恒 `retriable:false` 都改用它；media 增加重试路径：瞬时失败且 attempts<maxAttempts 时 `failMediaJob({ retrying:true })`（job 回 queued）并返回 `status:'retry'` + task-engine 退避。测试：media/thumbnail handler 各加 transient→retry、permanent→failed 两例。

### 数据层 / 账务
- **P2-07 · `releaseStaleReservations` 是死代码（无任何调用方）** — ✅ 已处理（随 P1-27 commit `e68b239`）——worker 组合根 `createCreditLedgerFromUrl` 创建账本句柄传入 WorkerLoop，`startStaleReserveSweeper` 周期调用 `releaseStaleReservations({ olderThan: 1h, confirm: true })`（[worker-loop.ts:264](apps/worker/src/worker-loop.ts#L264)）；creditHandle.close() 随 shutdown finally 关闭。原描述「无任何调用方」已解决。
- **P2-08 · 无 title/size 排序索引** —— ✅ 已处理（2026-08-08）：`user_assets` 新增 `user_assets_user_title_idx`（`(user_id, lower(coalesce(file_name, model_id, id)))`）与 `user_assets_user_size_idx`（`(user_id, byte_size DESC NULLS LAST)`），迁移 0039。用 2000 行种子数据 EXPLAIN 验证：标题/大小排序均走索引预排序，不再全表全排。
- **P2-09 · keyset 决胜列缺 id** —— ✅ 已处理（2026-08-08）：`generation_records_user_created_idx` 由 `(user_id, created_at)` 改为 `(user_id, created_at, id)`（迁移 0039 DROP+CREATE），keyset 平局比较走索引。`generation_records_user_library_idx` 为同一模式的辅助索引，同样受益于 id 决胜列，本次未动（主路径已覆盖）。
- **P2-10 · 上传大小仅在读侧校验** —— ✅ 已核实并加固（2026-08-08）：writeObject 是哑适配器（策略在调用方）。逐调用方核实——asset 上传在 service 层按 `config.maxAssetSizeBytes` 校验（assets/service.ts:99）、avatar 按 `AVATAR_MAX_BYTES`、worker 产物持久化按 `fetchProviderArtifact` 的 `maxBytes` 上限下载后再写、media/thumbnail 从有界源派生。写路径均先定界，无未校验入口。两个适配器补 P2-10 契约注释，防止未来新写路径忘记定界。
- **P2-11 · task_records 注释与 CHECK 不一致（含 'retry'）** —— [schema.ts:657](packages/db/src/schema.ts#L657) 注释声明含 'retry'，[:696](packages/db/src/schema.ts#L696) CHECK 只有 queued/running/succeeded/failed/cancelled。已验证状态机从不持久化 'retry'（落到 queued）—— 约束对、注释过时，统一即可。

### 模型知识
- **P2-12 · rule.code 是死配置** —— ✅ 已处理（2026-08-08）：新增 `ParameterIssueCode` 白名单联合（含 `REQUIRED_MEDIA`/`TOO_MANY_MEDIA`），`validation.ts` 的 `fromRuleIssue` 改为取 `rule.code ?? 兜底码` 接线；`registry-check.ts` 加运行时白名单断言（tsx 不经 typecheck 也能挡漂移）。两个剧本 manifest 的 `conditions.mode` 交叉引用保持有效。
- **P2-13 · 剧本模型内部 `mode` 是死配置** —— ✅ 已处理（2026-08-08）：判定为「计费模式标记」而非 bug——rate `conditions.mode` 必须引用已声明参数（registry-check 断言），`mode` 承担该交叉引用并文档化四个计费桶；恒假 visibleWhen 使其不进 UI、applyDefaults 剥离。两个剧本 manifest 补充 P2-13 注释说明标记语义与 pricing.ts 字面字符串硬编码的对应关系。
- **P2-14 · qwen-image-max 的 `n` 参数泄漏进 UI** —— ✅ 已处理（2026-08-08）：`qwen-image-2.ts` 的 `n`（min:1 max:1）加恒假 `visibleWhen: { field: 'prompt', equals: 'internal:never-user-visible' }`，提交时被 `removeHiddenParameterValues` 剥离；定价 `quantityFrom` 缺省回退 1 = 固定值，估价/结算不受影响。
- **P2-15 · 剧本模型 output 映射与真实响应不符（潜藏）** —— ✅ 已处理（2026-08-08）：两个剧本 manifest 的 `output.path` 由 `output.text` 改为 `output.choices.0.message.content`（chat completions 兼容路径）；流式路径不读 manifest.output，此处供未来 async-poll 时 `assertResponseShape` 推导关键路径，消除漂移。
- **P2-16 · deepseek providerModel 等于 manifest id（全仓唯一，需核实）** —— ❓ 待核实（2026-08-08）：`providerModel: 'deepseek-v4'` 即百炼模型名；本地无 console 对照，保留，改动需人工在百炼控制台确认真实模型名。
- **P2-17 · fun-asr speakerCount 缺 step** —— ✅ 已处理（2026-08-08）：`fun-asr.ts` speakerCount 补 `step: 1`，`2.5` 等小数不再通过校验（与 paraformer 一致）。
- **P2-18 · 可选字符串空串原样透传 provider** —— ✅ 已处理（2026-08-08）：`validation.ts` 的 `applyDefaults` 新增归一化——text 参数值为 `''` 时视为未提供并删除（与 isEmpty 语义一致），deepseek `stop` 清空后不再以空串进请求体。
- **P2-19 · catalog/api-client 投影手工维护易漂移** —— ✅ 已处理（2026-08-08）：新增根契约测试 `tests/catalog-projection-completeness.test.ts`——类型层 `Exclude<keyof ModelParameter, ...>` 强制覆盖（model-core 加字段未同步即 tsc 红）+ 运行层对每个已注册模型经 `ModelCatalogItemSchema.parse` 断言投影字段不丢（`parsed.parameters` deep-equal 任一字段剥掉即红）。为此把 `ModelValidationRuleSchema` 从模块私有改为导出。
- **P2-20 · selectRate 的 `pool[0]` 静默回退可能低估费用** —— ✅ 已处理（2026-08-08）：`pricing.ts` 新增 `conservativeFallback`——conditions 未命中且无默认价时取池中每单位分值最高 rate（保守上界），不再静默取第一条；`selectRate` 与 `tokenRateCents` 均接线。两个剧本 manifest 把「视觉文本输入 / 多模态文本输出」设为默认价，使常见路径不被保守回退高估（音频档仍按 mode 区分）。新增两条定价测试锁定行为。
  - **回归修复（2026-08-08）**：conservativeFallback 暴露了条件匹配对「缺省参数」的误判——worker 的 poll 续跑路径刻意不重跑默认值填充（raw params 无 `audio`），`matchesConditions` 的 `params[key] === value` 把 `undefined === false` 判为不匹配，keling std 档永远命中不了 → 保守回退取到 pro-audio 1.2（dashscope-runner 期望 420 实得 840）。修复：`matchesConditions` 用 manifest 声明的 `defaultValue` 解析缺省参数的有效值再比较（`audio` 默认 false、`promptExtend` 默认 true 都正确命中）。新增两条 pricing 回归测试锁定（false 默认 / true 默认两种模式）。

### API
- **P2-21 · SSE 事件名不一致** —— ✅ 已处理（2026-08-08）：创建/重试的路由手工发布统一改为 `generation.status`，`BailianStudioSSEEventMap` 删除 `generation.created`，前端监听列表同步去掉。调查确认 hub 已按事件 id 去重（sse-hub.ts），生产无重复投递——真正的 bug 只是「同一事件名取决于时序」（live 由路由发 `created`、重放/listener 发 `status`）。现在创建即首个 status 事件，live/重放/listener 三路同名。
- **P2-22 · `finalCents` 弃用别名保留 3 处** —— ✅ 已处理（2026-08-08）：已无消费者，按计划删除。删 generations/routes.ts、usage/routes.ts 两处响应字段 + api-client schemas 两处 schema 字段 + 测试 mock 引用。credit-ledger / generation-repository 的 `finalCents` 是结算内部参数名（与 HTTP 别名无关），保留。
- **P2-23 · `markGenerationProcessing`/`scheduleGenerationPoll` 迁移失败误抛 `GENERATION_NOT_CANCELLABLE`** —— ✅ 已处理（2026-08-08）：新增专用错误码 `GENERATION_NOT_PROCESSABLE`（repository errors.ts 联合 + api http-errors 409 映射），两处 throw 换用；repository.test 同步断言。cancel 路径的 `GENERATION_NOT_CANCELLABLE` 保留不动。

### 前端
- **P2-24 · assets-store `getFreshAsset` 的 set() 形状错误（死代码）** —— ✅ 已处理（2026-08-08）：接口声明 + 实现一并删除（grep 无调用方；set 返回裸 Record 会污染根状态，`remove` 已提供正确的 `{ queries }` 更新范式）。
- **P2-25 · 任务筛选 `matchesProgress.running` 漏状态** —— ✅ 已处理（2026-08-08）：running 分支复用 `ACTIVE_GENERATION_STATUSES`（原手写 queued/processing 与真实状态机对不上，`queued` 甚至不是合法状态）。
- **P2-26 · 详情页重复手写状态列表** —— ✅ 已处理（2026-08-08）：`isActive` 改用 `ACTIVE_GENERATION_STATUSES.has(status)`。
- **P2-27 · `setGenerationLibraryState` 复用 CancelGenerationResponseSchema** —— ✅ 已处理（2026-08-08）：新增语义正确的 `GenerationRecordUpdateResponseSchema`（`{ record }`），client 改用它；取消端点继续用 Cancel 版本。
- **P2-28 · 通知点击不定位到具体作品** —— ✅ 已处理（2026-08-08）：社交通知点击改为 `navigate('/generations/:recordId')` 定位到具体作品详情（recordId 即作品 id）。

### 工程化 / 运维 / 文档
- **P2-29 · 迁移在单次部署中跑两遍** —— ✅ 已处理（2026-08-08）：`up -d` 加 `--scale migrate=0`（migrate 是 restart:no 一次性服务，已由 `run --rm migrate` 跑过）；docker compose 实验验证 scale=0 时 `depends_on: service_completed_successfully` 的 api/worker 立即启动，不会启第二个 migrate 容器。
- **P2-30 · ensure-audit-action-constraint 每次 push 都 DROP/ADD** —— ✅ 已处理（2026-08-08）：先查 `pg_constraint`（`pg_get_constraintdef` 抽取 action 集合），与期望一致则 no-op 跳过；仅不一致/缺失才 DROP/ADD。已用 test DB 验证 no-op 与重建两条路径。
- **P2-31 · nginx 模板依赖宿主机全局 `$connection_upgrade` map** —— ✅ 已处理（2026-08-08）：模板加注前置说明；setup-host-edge.sh 自检 `$http_upgrade → $connection_upgrade` map 是否已定义，缺失时自写 `/etc/nginx/conf.d/websocket-upgrade.conf` 兜底（幂等，避免与全局定义重复导致 duplicate map）。
- **P2-32 · 运维脚本普遍依赖手动导出 DATABASE_URL** —— ✅ 已处理（2026-08-08）：credits:reconcile/release-stale/admin:promote/db:backfill:credits/db:seed:model-costs/queue:health/queue:retention 统一加 `dotenv -e infra/env/.env` 前缀。
- **P2-33 · db:push/studio 硬编码端口 URL（第三份拷贝）** —— ✅ 已处理（2026-08-08）：新增根契约测试 `tests/db-url-consistency.test.ts` 断言 defaults.ts ↔ package.json `db:*` 内联 URL ↔ .env.example/.env.test.example 三处来源一致，任何一处改串漏改其余即红。
- **P2-34 · setup-host-edge.sh 域名硬编码** —— ✅ 已处理（2026-08-08）：DOMAINS 改为读 .env.prod-infra 的 SITE_DOMAIN / LOGS_DOMAIN（缺省回退原值），换域名无需改脚本（模板按 `<域名>.conf` 命名随 infra/nginx/ rsync）。
- **P2-35 · 备份文件无完整性校验** —— ✅ 已处理（2026-08-08）：`pg_dump|gzip` 后先 `gzip -t "$TMP"` 校验，通过才原子 mv；损坏产物删除并标红退出。
- **P2-36 · README 表数过时** —— ✅ 已处理（2026-08-08）：README「23 张表」→「24 张表」（schema.ts 实为 24 个 pgTable，含 worker_heartbeats）。
- **P2-37 · prune-loki-logs.sh 用 `grep -q '{'` 判空** —— ✅ 已处理（2026-08-08）：改真正解析 JSON（优先 python3 `json.load` 判数组非空，无 python3 回退「去空白后非空数组」），空列表 `[]` 正确识别为「已应用」。
- **P2-38 · env 模板漂移（worker 心跳变量）** —— ✅ 已处理（2026-08-08）：三份模板补齐 `WORKER_LOCK_HEARTBEAT_MS` + `WORKER_HEARTBEAT_INTERVAL_MS`（.env.production.example 与 .env.example 两个都有，.env.test.example 有 `WORKER_LOCK_DURATION_MS`）。

---

---

## 6. 第二轮横切审查新增（认证/邮件、前端完整性、测试质量、可观测性）

> 第二轮换 4 个横切视角，均已核对 file:line：认证与账号体系完整性、前端功能完整性 vs 设计文档、测试质量与覆盖、可观测性/错误体系/依赖/构建。编号前缀 R2-。与第一轮同源的发现只做交叉印证，不重复展开。

### 6.1 认证与账号体系（验证邮件闭环 / OAuth / 会话）

<a name="r2-p0-01"></a>
**R2-P0-01 · 重发验证邮件被「掩码邮箱」打断 —— 按钮显示成功但什么都没发（已验证）**
> ✅ 已处理（commit `026ea75` fix(auth)，2026-08-08）
- **位置**：[service.ts:440](packages/auth/src/service.ts#L440)（register 返回 `maskEmail(email)`）→ [auth-store.ts:91](apps/web/src/stores/auth-store.ts#L91)（`pendingVerificationEmail` 存的就是掩码）→ [CheckEmailPage.tsx:18](apps/web/src/pages/auth/CheckEmailPage.tsx#L18)（`resend(掩码)`）→ [service.ts:468-485](packages/auth/src/service.ts#L468-L485)（`findActiveUserByEmail(掩码)` 查无此人 → 按防枚举语义静默返回 `accepted:true`）
- **影响**：验证邮件丢失/过期的用户永远无法完成验证、无法登录，账号成死号；且是**假成功**（前端提示「已重新发送」）。
- **修法**：register 响应里掩码仅供展示（单独 `displayEmail` 字段），前端在注册提交时把**原始邮箱**存入 store；或重发端点改按 userId 维度。补 register→resend 端到端契约测试（现有 resend 测试都直接传全量邮箱，覆盖不到这个 bug）。

**R2-P0-02 · 登录回跳 `?cb=` 未过白名单，自带校验函数零引用（已复核：中等风险）**
- **位置**：[LoginPage.tsx:42,57](apps/web/src/pages/auth/LoginPage.tsx#L42)、[AuthDialog.tsx:41-43](apps/web/src/components/auth/AuthDialog.tsx#L41)、[ProtectedRoute.tsx:28-29](apps/web/src/components/auth/ProtectedRoute.tsx#L28)；[auth-callback.ts:41-58](packages/api-client/src/auth-callback.ts#L41)（`isAllowedCallback`/`resolvePostLoginRedirect` 已导出、有测试，但 web 侧零引用）
- **实际风险说明**：react-router `navigate('//evil.com')` 按 pathname 解析，pushState 对跨源 URL 会抛错而非跳转 —— 不是真开放重定向。但「校验函数存在却未在使用点应用」是防线下沉：一旦某处改用 `location.href` 即变真漏洞。按中等（P1）记录。
- **修法**：`LoginPage`/`AuthDialog` 跳转前统一走 `resolvePostLoginRedirect(callback, '/create', allowedOrigins)`；接线或删除 auth-callback.ts。

**R2-P1-01 · SMTP 故障时注册已落库，但用户没有可用重发路径**
- **位置**：[service.ts:370-387](packages/auth/src/service.ts#L370-L387)（发信失败抛 `EMAIL_DELIVERY_FAILED`、账号已保留）；[LoginPage.tsx:52-60](apps/web/src/pages/auth/LoginPage.tsx#L52)（catch 只显示错误、不跳 check-email）
- **修法**：收到该错误仍进 check-email 并存好原始邮箱，文案区分「已发」与「待重发」。

**R2-P1-02 · 未验证账号无「重发验证」UI 入口（防枚举做对了，但把用户锁死）**
- **位置**：[user-error.ts:13](apps/web/src/lib/user-error.ts#L13)（把 `AUTH_EMAIL_TAKEN` 映射成「该邮箱已被注册」，丢弃服务端 `resend_verification` 指引）；[LoginPage.tsx:110-112](apps/web/src/pages/auth/LoginPage.tsx#L110)（未验证态无按钮）
- **修法**：login 页对 `AUTH_EMAIL_UNVERIFIED`/未验证的 `AUTH_EMAIL_TAKEN` 渲染「重新发送验证邮件」；前端持久化原始邮箱（sessionStorage）。

**R2-P1-03 · GitHub OAuth 新用户路径无唯一冲突兜底 —— 并发首次授权必有一个失败**
- **位置**：[service.ts:501-543](packages/auth/src/service.ts#L501)（`loginWithGithub` 新建/绑定无 `isUniqueViolation` 处理，register 有，:428-435）；`users_github_id_idx` 部分唯一索引（schema.ts:77）
- **修法**：补 `isUniqueViolation` 兜底，冲突时按 githubId 重查并 `issueSession`（幂等）。

**R2-P1-04 · GitHub 邮箱 `verified` 判定两条路径不一致**
- **位置**：[github-routes.ts:221](apps/api/src/modules/auth/github-routes.ts#L221)（`/user` 直取 `email`，未检查 verified）vs [:230](apps/api/src/modules/auth/github-routes.ts#L230)（`/user/emails` 兜底要求 `verified===true`）
- **需核实**：GitHub 当前 profile 公开邮箱实际都已验证，影响可能为零；语义不一致是隐患。
- **修法**：两路径统一强制 `verified===true`。

**R2-P2-01 · GitHub 解绑完全缺失**（未承诺，属完整性缺口）—— [repository.ts:126](packages/auth/src/repository.ts#L126) 只有 `linkGithubId`，无 unlink/端点/UI；`PublicUser` 不暴露 githubId。
**R2-P2-02 · GitHub-only 账号「修改密码」永远失败** —— OAuth 用户 passwordHash 为随机值（service.ts:533），`changePassword` 校验 currentPassword（:609-611）；ProfilePage:148-160 对所有人显示，UI 无法区分账号类型（PublicUser 无 githubId）。
**R2-P2-03 · 会话无滑动续期** —— [jwt.ts:82](packages/auth/src/jwt.ts#L82) 固定 7 天绝对过期，长在线用户被强制重登。属设计选择，需明确产品预期。
**R2-P2-04 · sessions/authActionTokens 无清理任务** —— 软删累积孤儿行（repository.ts:573-640），轻微存储膨胀，无安全影响。
**R2-P2-05 · 重发冷却前端写死 60s** —— [CheckEmailPage.tsx:26](apps/web/src/pages/auth/CheckEmailPage.tsx#L26) 未消费服务端 `retryAt`（service.ts:483），服务端调整冷却后倒计时漂移。

### 6.2 前端完整性 vs 设计文档（文档承诺 vs 实际接线）

**R2-P1-05 · 「恢复」功能缺失 —— 文档承诺但无任何 UI** — ✅ 已处理（2026-08-08）
- **位置**：[GenerationDetailPage.tsx:258,261](apps/web/src/pages/GenerationDetailPage.tsx#L258)（只实现 hidden/deleted）；[generation-client.ts:272](packages/api-client/src/generation-client.ts#L272)（`GenerationLibraryState` 支持 `visible`）；API 在（generation-client.ts:745）
- **影响**：隐藏/移除任务不可逆，用户无法找回。docs/02-design 功能矩阵声称「隐藏/删除/恢复」合并到位，恢复缺失。
- **修法**：任务列表 hidden/deleted 视图（PageVariant 行内「恢复」按钮，恢复后按当前视图重拉使行消失）+ 详情页 trash 态把「隐藏/移除」换成「恢复」，调 `setLibraryState(id,'visible')`。

**R2-P1-06 · 上传「取消」只做一半 —— 客户端支持 AbortController，UI 未接线** — ✅ 已处理（2026-08-08）
- **位置**：[generation-client.ts:145-167](packages/api-client/src/generation-client.ts#L145)（`uploadAssetWithProgress` 支持 `signal`→abort）；[AssetPickerDialog.tsx:68-85](apps/web/src/components/assets/AssetPickerDialog.tsx#L68)（从不传 signal、无取消按钮）；关弹窗后 XHR 继续在后台跑
- **修法**：AssetPickerDialog 持有 AbortController，上传中显示「取消上传」，onOpenChange/卸载时 `abort()`（含「确定」关弹窗路径）；取消上传不展示错误文案（`REQUEST_ABORTED`/`AbortError` 静默）。

**R2-P1-07 · 任务列表加载错误被静默吞掉，显示误导性空态** — ✅ 已处理（2026-08-08）
- **位置**：[generations-store.ts:90](apps/web/src/stores/generations-store.ts#L90)（load 失败写 `error`），但全仓无组件读取（已 grep 确认）
- **影响**：SSE 降级/500 时用户看到「还没有生成任务 / 去创作吧」，误以为真没有任务。
- **修法**：GenerationsPanel 两形态渲染 `state.error`，与空态区分（embedded 空态 + page 空列表都渲染错误态 + 重试按钮；有旧数据时给一行「列表刷新失败，当前显示上次结果」提示）。

**R2-P1-08 · ThemeToggle 是死代码（功能本身可用，组件未接线）**
- **位置**：[ThemeToggle.tsx](apps/web/src/components/layout/ThemeToggle.tsx) 从未被 import；主题切换实际在 [UserMenu.tsx:68-71](apps/web/src/components/layout/UserMenu.tsx#L68) 内联
- **修法**：把 ThemeToggle 接进侧栏/顶栏，或删除并在 docs 里把「ThemeToggle」表述改为「账户菜单主题切换」。

**R2-P2-06 · admin 守卫与 CLAUDE.md/注释不符** —— [ProtectedAdminRoute.tsx:25-27](apps/admin/src/components/ProtectedAdminRoute.tsx#L25) 非 admin 一律 `<Navigate to="/login">` 无 403 页；[admin-auth-store.ts:23](apps/admin/src/stores/admin-auth-store.ts#L23) 注释还写着「403 页由守卫展示」。实现真 403 页或改文档/注释，二选一。
**R2-P2-07 · 32 个未引用的 shadcn/ui 组件（web 约 3887 行）** —— `accordion/aspect-ratio/attachment/breadcrumb/bubble/button-group/calendar/carousel/combobox/command/context-menu/direction/drawer/empty/field/hover-card/input-otp/item/kbd/marker/menubar/message-scroller/message/native-select/navigation-menu/pagination/popover/progress/radio-group/resizable/slider/spinner` 全仓零 import；其中 attachment/bubble/button-group/direction/empty/field/input-group/item/kbd/marker/message/message-scroller/native-select/spinner 是早期聊天/演示 UI 遗留（本产品无聊天）。calendar/carousel/combobox/command/menubar 带 Radix 依赖拉进构建。
**R2-P2-08 · 死方法** —— store `setLibraryState`（generations-store.ts:57,151，无组件调用）、client `getAssetCapabilities`（generation-client.ts:373,860，仅被自身单测引用）、[GenerationDetailPage.tsx:10](apps/web/src/pages/GenerationDetailPage.tsx#L10) 未使用的 `Switch` import。
**R2-P2-09 · 空态/加载态缺失** —— [CatalogPage.tsx](apps/web/src/pages/CatalogPage.tsx) 无 Skeleton（对比 CreatePage）；GenerationsPanel `PageVariant` 空 records 时只渲染空容器、无「还没有任务」文案。
**R2-P2-10 · 文档措辞漂移（功能存在）** —— docs G 称 Nav 为「社区」，实现为「首页」（Nav.tsx:24）；docs D「LibraryPage『我公开的』筛选」标为可选未实现（非违约）。

### 6.3 测试质量与覆盖（测试是否真的测到了行为）

**R2-P1-09 · 三个 P0 缺陷无回归测试（batchId / artifact 重试 / ASR 参数）**
> ✅ 已处理（commit `3c6b12a`）——batchId 进 body 精确断言（generation-client.test.ts:286，随 P0-03 落地已核实）+ artifact 重试 retry 用例（artifact-task-handler.test.ts 三用例随 P0-02 落地已核实）+ ASR 映射下沉 apps/web/src/lib/tool-submission.ts 纯函数并单测（fileUrls 非 audioUrl，P0-01 回归）。
- **位置**：[generation-client.test.ts:243,267](packages/api-client/tests/generation-client.test.ts#L243)（对 body 做 `toEqual(JSON.stringify(...))` 精确断言，但所有用例不传 batchId —— 丢字段也全绿）；[artifact-task-handler.test.ts](apps/worker/tests/artifact-task-handler.test.ts)（仅 1 个用例，无 retry 路径断言）；ASR 参数错在 UI 层，按「不测 UI」约定纯函数层够不到
- **修法**：补「batchId 进 body」精确断言（修复落地即生效）；补「retriable 存储错误 → `{status:'retry'}`」用例（现有源码下必红）；把剧本/ASR 分发下沉为纯函数（`apps/web/src/lib/`）并单测参数映射，或在 generation-submit.test.ts 补 fun-asr 用例。

**R2-P1-10 · apps/admin 全 app 零测试，`passWithNoTests` 掩盖空跑**
> ✅ 已处理（commit `17b0f20`）——admin 补 user-error.test.ts（镜像 web）+ chunk-recovery.test.ts（识别/忽略/reload 一次守卫），vitest.config passWithNoTests 改 false，空跑即红。
- **位置**：[admin/vitest.config.ts:13](apps/admin/vitest.config.ts#L13)（`passWithNoTests:true`）；41 个 src 文件 0 测试；`src/lib/user-error.ts`(84)/`chunk-recovery.ts`(55) 全是可测逻辑
- **修法**：至少补 user-error + chunk-recovery（与 web 同名模块对齐）；`passWithNoTests` 改 false 让空跑变红。

**R2-P1-11 · `test:coverage` 是死链，60% 阈值无人 enforce**
- **位置**：[package.json:22](package.json#L22)（`test:coverage` → `turbo run test:coverage`，全仓无包定义该 script）；[web/vitest.config.ts:18-22](apps/web/vitest.config.ts#L18)（v8 + 60% 阈值只能手动触达、不在 verify）；「重建 coverage 基线」3 次 commit 实为 bailian-adapter 产物（402a006 已删）
- **影响**：当前没有任何代码覆盖率基线被跟踪或 enforce；`pnpm run test:coverage` 直接报无任务。
- **修法**：删死阈值 或 给 web 加 `test:coverage` script 并接进 verify。

**R2-P1-12 · 登出数据清理注册表（`registerPrivateDataReset`）无测试**
> ✅ 已处理（commit `e055d4f`）——auth-store.test.ts：导入 6 个注册 store 播种标志数据→resetAllPrivateData 后全部清空（注册表漏掉任一 store 即红）+ allSettled 容错（单个回调 reject 不拖垮整体）。
- **位置**：[auth-store.ts:16-24](apps/web/src/stores/auth-store.ts#L16)；6 个 store 模块级注册回调（generations/assets/notifications/credits/reference-assets/generation-artifacts）
- **影响**：若某 store 忘注册，登出即跨用户残留数据；「每个 store 都注册了」这个不变量无测试保护。
- **修法**：auth-store.test.ts 断言「注册→resetAllPrivateData→登出后各 store 清空」+「注册表包含预期 store 集合」。

**R2-P1-13 · e2e 死端口 spec 无回归（印证 P1-38）** —— [account-assets.spec.ts:10](e2e/legacy-vue/account-assets.spec.ts#L10) 5103 vs [playwright.config.ts](e2e/playwright.config.ts) 5003；该 spec 曾是**唯一「上传→复用→生成→登出后直访被拒」真实资产闭环 e2e**。已随 P1-38 处理：legacy spec 归档（选择器/路由与 React 重写脱节，改端口无意义），闭环由 [asset-loop.spec.ts](e2e/asset-loop.spec.ts)（API 驱动）接手。

**R2-P2-11 · 6 个 web lib 纯函数文件完全无测试** —— [chunk-recovery.ts](apps/web/src/lib/chunk-recovery.ts)(64：5 个 chunk 错误模式 + sessionStorage 单次 reload 守卫)、[creation-presets.ts](apps/web/src/lib/creation-presets.ts)(97：同名覆盖/容量 12 淘汰/版本化/`buildParamsFromRecord`)、labels.ts(69)、model-description.ts(14)、money.ts(16)、utils.ts(12)。前两个有真实状态逻辑，优先补。
**R2-P2-12 · worker 集成测试共享同一隔离库、无 beforeEach 重置** —— [integration.test.ts:18-29](apps/worker/tests/integration.test.ts#L18) 靠注释要求手动排空避免顺序依赖；回归留下排队任务会泄漏进下一用例。补 afterEach「无遗留 queued 任务」断言。
**R2-P2-13 · e2e workbench 产生数据不清理** —— [workbench.spec.ts:211-226](e2e/workbench.spec.ts#L211) 注册真实用户/积分/任务但无 afterAll（account-assets 有），反复手动跑累积 test DB。
**R2-P2-14 · FakeRepository.saveTask 忽略 expectedWorkerId** —— [fixtures.ts:420-423](apps/worker/tests/fixtures.ts#L420) 恒返回 task，锁被抢走的 `result_discarded_lock_lost` 路径在集成层未真正测到（repository.test.ts 两端分别覆盖）。

### 6.4 可观测性 / 错误体系 / 依赖 / 构建

<a name="r2-p0-03"></a>
**R2-P0-03 · API 兜底错误把 message/cause 原样回客户端 + 原样进日志（双路泄漏）**
> ✅ 已处理（commit `0b8689e` fix(security)，2026-08-08）
- **位置**：[http-errors.ts:190-194](apps/api/src/lib/http-errors.ts#L190-L194)（响应侧）+ [app.ts:136-142](apps/api/src/app.ts#L136)（`request.failed` 把同一个 `errorMessage(error)` 打进日志，挂在 `message` key —— 不在脱敏名单内）
- **影响**：与第一轮 P1-03 是同一根因，但本轮确认**日志侧同样漏**：DB 连接信息、provider 网络错误、被包装 cause 里的 prompt/签名 URL 片段同时出现在客户端响应与 Loki。
- **修法**：兜底分支只回稳定 `INTERNAL_ERROR`+traceId；日志侧对错误文本「截断 + 值级脱敏」。

**R2-P0-04 · 日志脱敏是「按 key 名替换」，message 串与值侧完全不过滤**
> ✅ 已处理（commit `0b8689e` fix(security)，2026-08-08）
- **位置**：[logger.ts:33](packages/shared/src/logger.ts#L33)（`SENSITIVE_METADATA_KEY`）+ [safeJsonStringify](packages/shared/src/logger.ts#L46)（只按 key 命中替换，覆盖嵌套对象这点是对的）
- **盲区**：(1) **message 字符串永不脱敏** —— 全仓 59 处 `logger.*` 调用大量把错误文本放 `message`/`error` key（[generation-task-handler.ts:303-312](apps/worker/src/generation-task-handler.ts#L303)、[:345-351](apps/worker/src/generation-task-handler.ts#L345)、[:395-402](apps/worker/src/generation-task-handler.ts#L395)、[worker-loop.ts:230-238](apps/worker/src/worker-loop.ts#L230)、[app.ts:141](apps/api/src/app.ts#L141)）；(2) **非名单 key** 如 `jwt`/`cookie`/`accessKeyId`/`signature` 不替换。
- **修法**：正则补 `accessKeyId|accessKey|jwt|session|cookie|credential|signature`；对值里的凭据模式（如 `[A-Z0-9_]{16,}`、已知 secret 前缀）做模糊化；或规定日志接口不允许原样落 Error.message。
- **已核实安全侧**：worker 未把 DashScope 请求/响应体打日志（`DashScopeHttpError.raw` 只存不记），脱敏框架本身（输出前替换/含嵌套/双格式/绝不抛错）是对的。

**R2-P1-14 · 错误体系与 docs/02-design §4.2 宣称完全不符（6+ 套平行错误类）** — ✅ 已处理（2026-08-08，取 (b) 路径）
- **位置**：[02-design.md:138](docs/02-design.md) 宣称「RepositoryError/ProviderErrorInfo/AuthError 全部继承 BailianStudioError」；实际 [errors.ts:9-17](packages/shared/src/errors.ts#L9) 自述「各业务层各自定义，并未统一继承」，`BailianStudioError` 只有 `ValidationError` 继承；`GenerationRepositoryError`/`AuthError`/`CreditLedgerError`/`MediaRepositoryError`/`ModelCoreError`/`ApiClientError`/`DashScopeHttpError` 全 `extends Error`；`ProviderErrorInfo` 是 **interface 不是 class**，本身不可能「继承」
- **影响**：契约不一致（code 各自 string union、`details`≠`metadata`、无 retryable）；[http-errors.ts:75-95](apps/api/src/lib/http-errors.ts#L75) 靠 `instanceof` 逐一映射，新错误类型落到兜底 500（即 R2-P0-03 泄漏路径）
- **修法**：二选一 —— (a) 真收敛：各层错误继承 `BailianStudioError`，统一 `code`/`retryable`/`metadata`；(b) 至少把 02-design:138 改写为现状，并给 http-errors 兜底分支加「不得透传 message」约束。
- **处理**：取 (b)——02-design:138 改写为现状（集中映射契约 + 兜底 INTERNAL_ERROR 不泄漏）；「不得透传 message」约束已在 R2-P0-03 落地（[http-errors.ts:190-194](apps/api/src/lib/http-errors.ts#L190-L194)），文档如实记录。跨层统一继承留待后续。

**R2-P1-15 · 指标「只写不读」—— 无任何观测出口**
- **位置**：[metrics.ts:4-7](apps/api/src/lib/metrics.ts#L4)（注释「供未来的 /metrics 端点」）；[app.ts:125-126](apps/api/src/app.ts#L125)（api.request）；[generation-task-handler.ts:604-613](apps/worker/src/generation-task-handler.ts#L604)（worker.provider_request）；[worker-loop.ts:126-128](apps/worker/src/worker-loop.ts#L126)（`metricsSnapshot()` 无调用方）；全仓无 `/metrics` 端点
- **影响**：api.request 状态码分布、provider 请求耗时/失败率在 Loki/Grafana 里不可见 —— 观测栈白装。
- **修法**：最低成本 —— admin 鉴权的 `GET /api/metrics`，或按周期把 `snapshot()` 打一条 json 日志进 Loki。

**R2-P1-16 · 未使用依赖声明（6 条，零 import）** — ✅ 已处理（2026-08-08）
- **位置**：worker `package.json` 声明 `@bailian-studio/event-bus`；api 声明 `@bailian-studio/task-engine`；credit-ledger + media-repository 各声明 `@bailian-studio/shared` + `postgres`；web 声明 `date-fns` —— 各自 src+tests 0 处 import
- **修法**：删除这 6 条声明。

**R2-P2-15 · provider-health 孤儿包被 Dockerfile 打进镜像**（印证 worker 轮 P2-01）— ✅ 已处理（2026-08-08）——随 P2-01 删除整个包，Dockerfile 两处 COPY 移除（见 P2-01 处理记录）。
**R2-P2-16 · pnpm-lock 双版本 zod（v3.25.76 由 shadcn CLI devDep 拉入 + 业务面 v4.4.3）** —— 仅 dev 依赖树，无运行时冲突，但 `pnpm exec`/类型环境偶发混用。
**R2-P2-17 · 根 package.json 把 drizzle-kit/tsx/postgres 放 `dependencies`** —— [Dockerfile:95-98](infra/docker/Dockerfile#L95) 依赖它们是 prod 依赖才能进 runtime 镜像，改动需同步。
**R2-P2-18 · runtime 镜像装进前端依赖** —— [Dockerfile:75-98](infra/docker/Dockerfile#L75) 全量 `pnpm install --prod` 使 runtime node_modules 含 react/recharts（worker/api 用不到）；可用 `--filter` 缩小。
**R2-P2-19 · `safeJsonStringify` 对共享引用误判 Circular** —— [logger.ts:47,55-58](packages/shared/src/logger.ts#L47) 同一对象非循环出现两次，第二次输出 `[Circular]`（数据丢失非安全问题）。
**R2-P2-20 · admin 无 bundle 分组/分析** —— admin `vite.config.ts` 无 `build.rolldownOptions`（web 有 vendor-react/vendor-ui 分组 + 路由 lazy）；建议接 vite-bundle-visualizer 并给 admin 补 vendor 分组。

## 4. 已核实无问题（防回归清单，勿误改）

以下高风险点经逐行核实**当前实现正确**，改动时请保持：
- **账本正确性**：[credit-ledger/repository.ts:192-242](packages/credit-ledger/src/repository.ts#L192) appendMutation 幂等（findIdempotentEntry+断言）+ FOR UPDATE + 负余额守卫；settle 用 `cappedFinal=min(final,reserved)` 封顶；结算与置 succeeded 同事务、失败回滚；无重复结算、无失败扣费。
- **任务认领**：[repository.ts:3005-3048](packages/generation-repository/src/repository.ts#L3005) claim 的 SKIP LOCKED + 事务内二次 select + `transitionTask('claim')` 状态机校验正确；renewTaskLock 三重条件防旧 worker 续锁。
- **outbox 事务原子**：createGeneration 手工插首条 `submitting` 事件 + 统一 `clock_timestamp()`，状态变更由同事务触发器捕获。
- **keyset 分页**：listGenerationRecords/listAdminTasks/listUnifiedAssets 均 (createdAt,id) 决胜索引 + base64url 游标。
- **安全**：画廊跨用户产物读取（getGalleryArtifact 校验 visibility/status/deleted/author-banned）、本地存储路径穿越双重防护（sanitizeKey + relative 回溯）、媒体作业资产按 userId 过滤、auth token 单次性（FOR UPDATE + consumedAt）。
- **审计三处同步**：audit-types.ts / schema.ts:156 / ensure-audit-action-constraint.ts 当前 41 动作完全一致。
- **SSE 契约**：event-bus 真实事件带 `id:`、connected/heartbeat 省略；`use-generation-events.ts:44` 的 `lastEventId === ''` 判断正确。
- **客户端/后端校验等价**：`buildValidationParams`（generation-submit.ts:77-87）与 `prepareGenerationParams` 一致。
- **api-client「零 as」** 成立（仅一处合法 cast）。
- **文档已落地的修复**：画廊/提示词/反馈「无限刷新循环」已按 `loadFirst`/`loadMore` 分离修复（GalleryPage/PromptsPage/FeedbackPage）。

**第二轮补充核实（认证/前端/测试/可观测性视角）**：
- **OAuth state CSRF**：`loginWithGithub` 生成并校验 state（service.ts:518-525），github-routes 回调校验 state 且只在验证通过后建会话 —— 无 CSRF 缺陷。
- **注册并发唯一冲突**：register 对 `users_email_unique` 冲突做 `isUniqueViolation` 幂等兜底（service.ts:428-435），并发注册只有一个成功、另一个收到明确错误。
- **reset token 单次性**：`consumeAuthActionToken` FOR UPDATE + consumedAt，防重放。
- **邮件 HTML 转义**：验证/重置邮件正文转义后再拼 HTML，无注入。
- **cookie 属性**：JWT cookie 设 `httpOnly + sameSite:lax + path:/ + secure`（生产）；OAuth 回调不写敏感 cookie。
- **封禁门齐全**：login / loginWithGithub / verifyEmail / verifyToken 四处均已接 `bannedAt` 检查，与 docs/05-community-features.md §B 一致。
- **Mailpit 已配置**：dev 邮件走 Mailpit，本地可收验证邮件（非裸 SMTP 硬依赖）。
- **worker 日志安全**：未把 DashScope 请求/响应体打进日志，`DashScopeHttpError.raw` 只存不记。
- **tsconfig strict 全开**：`strict`/`noUncheckedIndexedAccess` 全仓生效，无开关缺口。
- **catalog 版本与 manifest 同步**：`version`/`updatedAt` 当前一致（P1-36 只涉 head 注释，非数据）。
- **api-success-contract 用的是真实 Postgres**：`createIsolatedGenerationRepository({max:2})` + 真实 creditLedger（仅 auth/storage mock）—— 契约测试并非内存仓库（修正第一轮 infra agent 的误判）。
- **FakeRepository 是 460 行行为副本**：apps/worker/tests/fixtures.ts 的 FakeRepository 是对真实 repository 的逐行为复刻，非轻量 stub；但 saveTask 忽略 `expectedWorkerId`（见 R2-P2-14）。

---

## 5. 主题归纳（架构层面的横切问题）

1. **「单一数据源」与「单一事实」的漂移风险**：model-core 是数据源，但 catalog 投影、api-client schema、FunctionsPage/chat-builder/pricing 的硬编码、rule.code 死配置 —— 四处「手工投影」都可能静默漂移（P1-37 / P2-12 / P2-13 / P2-19）。缺的是「投影完整性断言」这一类测试。
2. **迁移双轨是最大运维隐患**（P0-06）：dev/test/CI 用 push、生产用 migrate，无对账无门禁。这是「个人部署可接受」里风险最高的一项。
3. **账本/outbox 的无界增长**（P1-27 / P1-17 关联）：追加型账本 + 永不清理的 outbox + 全表扫描清扫，是规模增长后的定时炸弹。当前量级无碍，但清一色「没有清理策略」。
4. **幂等保护的覆盖面不齐**：submit 有幂等 key、chat/stream 没有（P0-05）、批量 grant 靠 idempotencyKey 但失败审计失真（P1-19）、前端指纹缓存跨用户残留（P1-07）—— 幂等是这套系统的正确性基石，值得做一次全面审计。
5. **e2e/CI 覆盖面与生产路径脱节**：CI 不跑 migrate 路径、e2e 不覆盖 SSE/资产闭环、verify 不自动加载 env（P1-38/P1-39）——「质量门禁」实际卡的宽度窄于声明。
6. **单实例假设**：内存限流 + 内存 SSE hub + 进程内 worker 串行 —— 文档均已标注，属有意识取舍；但 outbox 兜底轮询（P1-29）即便单实例也该补。

**第二轮新增主题**：
7. **「防枚举」做对了一半 —— 安全语义正确但把用户锁死成「假成功」**：验证邮件重发被掩码邮箱静默吞掉（R2-P0-01）、未验证账号无重发入口（R2-P1-02）、SMTP 故障无可用重发路径（R2-P1-01）。安全与可用性的平衡点：**掩码只用于展示，原始邮箱按 userId 关联**，而不是把掩码当真实身份。
8. **错误体系「文档宣称统一、代码实际分裂」**：docs/02-design §4.2 宣称全继承 BailianStudioError，实际 6+ 套平行错误类（R2-P1-14），叠加兜底分支双路泄漏 message/cause（R2-P0-03）+ 日志只按 key 名脱敏（R2-P0-04）。三层连锁，根因是「文档先行、代码未收敛」。
9. **测试与代码「不同步」比「没测试」更危险**：三个 P0 缺陷无回归用例（R2-P1-09）、admin 全 app `passWithNoTests` 空跑（R2-P1-10）、`test:coverage` 死链（R2-P1-11）、登出清理注册表无测试（R2-P1-12）。通病是**「测试在、但断言断不到真实行为」或「全绿但实际没跑」**。
10. **可观测性「白装」**：指标全链路只写不读（R2-P1-15）、provider-health 降级从未接线（R2-P2-15）、日志脱敏存在值侧盲区（R2-P0-04）。观测栈（Loki/Grafana）有了，但**没有任何一条链路把应用指标送进去**。
11. **死代码/死依赖的体积**：32 个未用 shadcn 组件 ~3887 行（R2-P2-07）、6 条未使用依赖声明（R2-P1-16）、provider-health 孤儿被打进镜像（R2-P2-15）。维护成本不在于「占空间」，而在于**每次改动都要先排除它们是否真有消费者**。

---

## 建议的推进顺序

- **第一周（止血，P0）**：P0-01 ASR 参数、P0-03 batchId 一行修复、P0-02 artifact 重试、P0-04 submitting 清扫、P0-05 chat 幂等、P0-06 verify 里加 `db:generate` 门禁；**本轮新增**：R2-P0-01 掩码邮箱重发（一行 + 契约测试）、R2-P0-03 兜底错误双路脱敏、R2-P0-04 日志 key 名单补齐 + message 值侧模糊化。
- **第二周（一致性与可靠性，P1 高优）**：P1-03 错误脱敏、P1-02 剧本预检量纲、P1-01 分页回退、P1-06 账本 set-based 化、P1-28 login 侧信道、P1-27 releaseStale 接线、P1-38 e2e 修复 + CI；**本轮新增**：R2-P1-09 三个 P0 的回归测试（与止血修复同步落地）、R2-P1-10 admin 补最小测试 + 关 `passWithNoTests`、R2-P1-05 恢复功能、R2-P1-06 上传取消接线、R2-P1-14 错误体系收敛（或先改 02-design §4.2 措辞）、R2-P1-16 删 6 条未用依赖。
- **第三周（中低优）**：P1 剩余 + P2 全量；**本轮新增**：R2-P1-01/02 重发 UI 闭环、R2-P1-04 GitHub verified 统一、R2-P1-11 coverage 死链、R2-P1-12 登出清理注册表测试、R2-P1-15 `/metrics` 观测出口、R2-P2-01/02 GitHub 解绑/改密、R2-P2-06 admin 403 页、R2-P2-07 删 32 个未用组件、R2-P2-15 provider-health 接线或删除、R2-P2-20 admin bundle 分组。重点补「投影一致性」「审计动作四源一致」「package.json URL 与 defaults 一致」三类断言测试，把漂移类问题变成「改错即红」。
