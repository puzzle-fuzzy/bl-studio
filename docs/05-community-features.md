# 社区化与运营特性 —— 设计文档

> 对应实施计划：`/Users/yxswy/.claude/plans/synchronous-bubbling-gosling.md`
> 状态：**已批准**。本文档是本次「社区化与运营」五特性的设计与实施说明，随代码一起维护。

## 背景与定位

产品定位：**纯百炼（DashScope）聚合 AI 媒体生成工具**，当前仅同事内部使用，积分以赠送为主，暂不对接支付。在已有「51 模型聚合（39 可用 / 12 个 vidu 暂未开通）+ 任务队列 + SSE + 积分账本 + 完整 admin」的基础上，本次落地 5 个方向，把产品从「工具」推向「可用社区、可运营、可治理」的形态：

1. **用户封禁联动**（禁登录 + 禁新提交 + 立即注销会话；在途任务放行完成不退款）
2. **admin 用户表多选 + 批量操作**（批量封禁/解封 + 批量赠送积分 + 批量删除）
3. **资产公开/个人可见性 + 社区画廊**（默认私有、可公开；收藏 + 点赞）
4. **创作闭环**：服务端提示词资产库、同 prompt 多模型对比生成、图生图闭环（编辑/变体/放大）、admin 成本毛利 + 留存漏斗
5. **反馈通道**（应用内意见反馈 + admin 反馈管理）

已确认的产品决策：

| 决策 | 结论 |
|---|---|
| 封禁语义 | 禁登录 + 禁新提交 + 立即注销已有会话；在途任务放行完成、不退款（积分已冻结，账目干净） |
| 批量操作 | 封禁/解封 + 赠送积分（已选）；批量删除一并纳入（原始需求「并支持删除」） |
| 收藏 / 点赞 | 两者都要：收藏 = 个人书签（私有）；点赞 = 社区公开资产的公开互动 |
| 提示词库 | 服务端命名库（跨设备、可搜索、可复用） |
| 社区画廊 | 登录可见（同事内网）；作品默认私有、用户主动公开 |

---

## A. DB 变更（一次迁移）

**文件：`packages/db/src/schema.ts` + 新迁移（drizzle-kit generate，提交迁移文件；dev/test 用 `db:push` / `db:push:test`）**

| 变更 | 内容 |
|---|---|
| `users` | + `bannedAt` / `bannedBy`（可空，审计式，模仿 `deletedAt/deletedBy`）。不动软删 —— 封禁保留邮箱占用，软删释放邮箱。 |
| `generation_records` | + `visibility`（text，默认 `'private'`，CHECK in `('private','public')`）；+ `batchId`（text 可空，对比批次分组） |
| 新表 `generation_likes` | `recordId, userId, createdAt`，PK(recordId,userId) |
| 新表 `generation_favorites` | 同上（个人收藏） |
| 新表 `prompt_library` | `id, userId, name, modelId, prompt, paramsJson, createdAt, updatedAt, deletedAt/deletedBy`（索引 user+updatedAt） |
| 新表 `user_feedback` | `id, userId, kind, content, status, createdAt, updatedAt, resolvedBy, resolvedAt`（索引 status+createdAt） |
| 新表 `model_costs` | `modelId, unitCostCents, currency, updatedAt`（admin 维护的每模型成本价） |

### 审计动作（3 处同步 + 1 处手工迁移）

`packages/generation-repository/src/audit-types.ts`、`packages/db/src/schema.ts` 的 `audit_logs_action_check`、`infra/scripts/ensure-audit-action-constraint.ts` 三处同步新增：
`admin.user.ban` / `admin.user.unban` / `gallery.like` / `gallery.favorite` / `feedback.submit` / `feedback.update` / `prompt-library.create` / `prompt-library.delete`。

**陷阱**：`drizzle-kit push/generate` 检测不到已命名 CHECK 表达式变更 —— 提交的迁移里必须**手工编写** `ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check; ADD CONSTRAINT ... 新列表`。

**迁移必须提交**：生产只走 `drizzle-kit migrate`（已提交迁移文件），不跑 `db:push`。

---

## B. 用户封禁

**持久化（packages/auth）**

- `repository.ts`：`findActiveUserBy` 目前只过滤 `deletedAt`；`UserRepositoryRecord` / `toUserRecord` 增加 `bannedAt/bannedBy` 投影。新增 `setUserBanned`、`setUsersBanned`（`WHERE id IN (...) AND bannedAt is null`）。
- `service.ts`：
  - **发放会话的路径全部加封禁门**：`login`、`loginWithGithub`、`verifyEmail`（也发放 AuthResult 会话）在验证后抛 `AuthError('AUTH_BANNED', '该账号已被封禁，请联系管理员')`。
  - `verifyToken`：`findActiveUserById` 后 `if (user.bannedAt !== null) return undefined` —— **单点卡口**：所有已认证路由（含生成提交、预估、SSE）自动失效。
  - 投影：`PublicUser` / `AdminUser` 增加 `bannedAt`。
  - `consumeAuthActionToken` 的删除拒绝处同步拒绝 banned。
  - 新增 `adminBanUser` / `adminUnbanUser` / `adminBatchBanUsers` / `adminBatchUnbanUsers` / `adminBatchDeleteUsers`。封禁/批量封禁同一事务 `revokeAllSessions`（镜像 `softDeleteUser`）；批量删除禁止 self。`revokeSessionByToken` / `revokeAllSessionsByToken` 保持不设封禁门。

**API（apps/api/src/modules/admin/routes.ts + schemas.ts）**

- `POST /api/admin/users/:userId/ban` / `unban`（审计 `admin.user.ban` / `admin.user.unban`）。
- 批量端点：`POST /api/admin/users/batch-ban` / `batch-unban` / `batch-delete` / `batch-grant-points`。
- 列表/详情返回带 `bannedAt`（`toAdminUser` 投影 + `AdminUserSchema`）。

**前端（apps/admin）**：UserListPage 加「封禁」状态徽章 + 单行封禁/解封操作。

**Web 表现**：封禁即被注销（`verifyToken` undefined → restore 401 → 回登录页）；再登录提示「账号已封禁」。`user-error.ts` 增加 `AUTH_BANNED` 文案。worker 不改（在途任务放行完成）。

---

## C. admin 用户表多选 + 批量操作

**apps/admin/src/pages/UserListPage.tsx**：首列 checkbox（全选 + 半选态）；选中数 > 0 显示批量工具栏：批量封禁 / 批量解封 / 赠送积分（Dialog）/ 批量删除（AlertDialog）。当前登录 admin 自身 checkbox 禁用。

**API**：`batch-ban` / `batch-unban` / `batch-delete`（`{ userIds }`，非空去重上限 100）；`batch-grant-points`（`{ userIds, amountCents, reason }` → API 层遍历 `creditLedger.grant`，idempotencyKey 按 userId 派生，审计 `points.grant`）。

**api-client**：`adminBatchBanUsers` / `adminBatchUnbanUsers` / `adminBatchDeleteUsers` / `adminBatchGrantPoints`。

---

## D. 作品可见性 + 社区画廊 + 收藏/点赞

**可见性（generation_records.visibility，默认 private）**

- generation-repository 新增：`setGenerationVisibility`（owner 限定）、`listPublicGalleryGenerations`（status=succeeded、visibility=public、未删未藏，join users 取 displayName，join 点赞数，返回 viewer 是否已赞/已收藏、首个已存 artifact 的 readUrl）、`getPublicGalleryGeneration`（跨用户详情，镜像 `getPublicSharedGeneration` 脱敏投影）、`getPublicGalleryArtifact`、`toggleLike`、`toggleFavorite`、`listMyFavorites`。新方法较多，可在 generation-repository 内拆 `content.ts` 模块再经 `src/index.ts` 再导出。
- API（社区端点统一挂 `/api/gallery`，避免与 `/api/generations/:id` 系列静态/参数段冲突）：`GET /api/gallery`（列表）、`GET /api/gallery/favorites`（我的收藏）、`PATCH /api/gallery/generations/:id/visibility`（owner）、`POST/DELETE /api/gallery/generations/:id/like`、`POST/DELETE /api/gallery/generations/:id/favorite`、`GET /api/gallery/generations/:id/favorite`（查询收藏态）、`GET /api/gallery/generations/:id`（跨用户详情）、**`GET /api/gallery/generations/:id/artifacts/:artifactId`（跨用户产物路由，必须新增** —— 现有 `/api/generations/:id/artifacts` 是 owner 限定；本地存储流式、OSS 走 `createReadUrl`，镜像 shares/routes.ts）。
- Gallery 条目返回**精选脱敏参数**（仅文本参数子集，显式剥离媒体/参考图 assetRefs）+ modelId + prompt + author + likeCount + likedByMe + favoriteByMe + 缩略 readUrl。**不返回原始 `inputParamsJson` 中的媒体/引用值**。

**前端**

- `/gallery` 路由（protected）：卡片网格；悬停操作：点赞 / 收藏 / 用同参数生成（深链 `?select=<modelId>&params=<base64url JSON>`）/ 看详情（调 `getGalleryGeneration` + `getGalleryArtifact`，不跳 owner 限定的 `/generations/:id`）。
- GenerationDetailPage：操作栏加「公开到社区 / 设为私密」Switch（公开前提示）+「收藏」按钮。
- LibraryPage 顶部筛选可加「我公开的」。

**规则**：收藏可作用于自己或他人、公开或私有的作品；点赞仅对公开作品；允许赞自己（同事内网，简化）。hide/delete 的公开作品自动从画廊消失。

---

## E. 创作闭环

### E1. 服务端提示词资产库
`prompt_library` 表；`GET/POST /api/prompt-library`、`PATCH/DELETE /api/prompt-library/:id`（owner 限定）；存 `{name, modelId, prompt, params}`（仅文本参数）。前端 `/prompts` 页 + GenerationDetailPage「保存为提示词」。提示词列表状态由 PromptsPage **页面本地 state** 承载（未建独立 zustand store——列表只在页面内使用，登出时随路由卸载自然失效）。

### E2. 同 prompt 多模型对比生成
`generation_records.batchId` + `CreateGenerationRequest.batchId?`。**关键**：`CreateGenerationSchema`（`packages/shared/src/validation.ts`）是**非 strict** 的 `z.object`，`batchId` 必须显式加 `z.string().optional()`（trim + 长度上限），否则被静默剥离。**不要**把 `batchId` 加入 `idempotencyKeyFor` 指纹（会破坏重试幂等）。CreatePage「对比模式」：公共参数填一次，多选 ≤4 模型 → 逐个 `createGeneration`（同 batchId）→ toast「已提交 N 个对比任务」。

### E3. 图生图闭环
`qwen-image-edit(-plus/max)` 是编辑模型（media 参数 `image` 1~3 张 + 编辑指令，size 到 2048×2048）；`wanx-image` 等带 `image_input` 的模型可作参考图生成变体。GenerationDetailPage artifact 卡片加「以图继续创作」：编辑 → `/create?select=qwen-image-edit&edit=<assetId>`；生成变体 → `/create?ref=<assetId>`；放大 → 编辑模型 size=2048×2048（目录无独立超分模型，如实标注）。CreatePage 扩展 `?edit=`/`?ref=` 深链预载。

### E4. 统一深链工具
`apps/web/src/lib/deeplink-params.ts`（纯函数 + 单测）：`encodeParams(manifest, textParams)` / `decodeParams(manifest, base64)`，按 manifest 校验、丢弃未知字段与媒体值、默认值兜底。CreatePage 统一处理 `?select=&params=` / `?edit=` / `?ref=` / 已有 `?reuse=`。

### E5. admin 成本毛利 + 留存漏斗
`model_costs` 表 + `infra/scripts/seed-model-costs.ts`（从 `infra/seed/model-costs.json` 播种）。API：`GET/PUT /api/admin/model-costs`；`GET /api/admin/stats/analytics`：按 modelId 分组成本毛利（收入 = Σ costFinal/costEstimate，成本 = 调用数 × unitCostCents）+ 留存漏斗（注册 → 首生成 → 成功生成 → 活跃 ≥2 日）。admin 新页 `/analytics`（recharts，成本毛利 + 留存漏斗两个 Tab）。

---

## F. 反馈通道

`user_feedback` 表。API：`POST /api/feedback`（登录，审计 `feedback.submit`）、`GET /api/admin/feedback`（admin，keyset + status 过滤 `open|reviewing|resolved|closed`）、`PATCH /api/admin/feedback/:id`（admin 状态流转，审计 `feedback.update`）。web：UserMenu「意见反馈」→ Dialog。admin：新 `/feedback` 页。

---

## G. 前端导航与入口

- web `Nav.tsx`：新增「社区」`/gallery`、「提示词」`/prompts`；UserMenu 加「意见反馈」。
- admin `AdminShell.tsx`：用户管理 `/users` · 调用统计 `/stats` · 分析 `/analytics` · 反馈 `/feedback`。
- 路由：web `/gallery`、`/prompts`（ProtectedRoute 内）；admin `/analytics`、`/feedback`。

---

## H. api-client 新增契约

- 封禁/批量：`adminBanUser` / `adminUnbanUser` / `adminBatchBanUsers` / `adminBatchUnbanUsers` / `adminBatchDeleteUsers` / `adminBatchGrantPoints`；`AdminUserSchema` 增 `bannedAt`。
- 画廊/收藏/点赞：`listGallery` / `getGalleryGeneration` / `getGalleryArtifact` / `setGenerationVisibility` / `toggleGenerationLike` / `toggleGenerationFavorite` / `listMyFavorites`。
- 提示词库：`listPromptLibrary` / `createPromptLibraryItem` / `updatePromptLibraryItem` / `deletePromptLibraryItem`。
- 反馈：`submitFeedback` / `adminListFeedback` / `adminUpdateFeedbackStatus`。
- 分析：`adminGetAnalytics` / `adminListModelCosts` / `adminUpdateModelCosts`。
- `CreateGenerationRequest` 增 `batchId?`。

## I. 测试

- `packages/auth/tests/service.test.ts`：login / loginWithGithub / **verifyEmail** 封禁拒绝（`AUTH_BANNED`）、verifyToken 对 banned 返回 undefined、ban/unban/批量 ban 注销会话、批量删除禁止 self。
- `apps/api/tests/admin-routes.test.ts`：单/批量 ban/unban/delete/grant 403 守卫 + 审计断言 + 拒绝 self。
- `apps/api/tests/`：gallery 列表、跨用户产物路由（非 public/被删 404）、visibility 越权 404、like/favorite 幂等、prompt-library owner 限定、**createGeneration 带 batchId 入库**、feedback 提交 + admin 状态流转、analytics 聚合。
- `packages/generation-repository/tests/`：新方法持久化 + 投影。
- 前端纯函数：`deeplink-params`、画廊排序/过滤、收藏去重。
- `fake-auth-service.ts` 扩展 `bannedAt` 开关。

## J. 范围外（明确不做）

- 支付/充值（赠送积分模式）。
- 匿名公开画廊（画廊需登录；公开分享仍走 `/share` 单条链接）。
- 内容审核/举报/水印策略（内网规模不引入；反馈通道可承载举报诉求）。
- 真实超分模型放大（目录无对应模型，用编辑模型 2048 档位近似）。
- SSE/限流多实例改造（单实例假设不变）。
