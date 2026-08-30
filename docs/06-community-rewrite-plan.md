# 社区功能重写计划（标准规范版）

> 对应审查报告《社区代码多角度审查》（画廊/收藏/提示词库/反馈/admin 治理的六个问题组）。
> 原则：**不按最小可行处理，按标准社区实践做全套**；社区目前无真实用户，允许大范围调整；
> **社区端点不做限流**。产出可执行、可验证、可回归。

## 0. 总体决策

| 决策 | 结论 | 依据 |
|---|---|---|
| 处理方式 | 全量实施六个问题组，非补丁式 | 用户明确"不要最小可行，按标准规范" |
| 社区限流 | **豁免**：gallery / prompt-library / feedback 三类用户写端点不经过限流 | 用户明确"社区不需要限流"（内部工具、无用户；文档中标注为有意偏离标准实践，可随时重启用 `API_RATE_LIMIT_ENABLED` 之外的豁免列表撤销） |
| 数据变更 | 新增 `notifications` 表 + 3 个审计动作（一次迁移 `0036`） | 社交通知与治理留痕都需要持久化 |
| 隐私边界 | 画廊仍只返回文本参数；**只有作者本人**可完整复用参考图（走既有 `?reuse=` owner 链路） | 设计文档 D 节不变量：剥离媒体 assetRefs |
| 测试 | 后端包测试补 gallery/favorites/notifications 用例；前端只补纯函数层；API 契约测试 | 仓库既有约定（前端不写 UI/样式测试） |

**六点问题 → 本计划章节：**

1. 正确性：无限刷新循环 + 收藏分页游标 → §1
2. 前端健壮性与可访问性：嵌套按钮 / hover 操作不可达 / text 破图 / 详情弹窗缺操作 → §2
3. 治理与生命周期：admin 社区治理 / 收藏可见性一致性 / 审计不对称 → §3
4. 社区体验与发现：社交通知 / 搜索排序作者模型过滤 / 参考图复用 → §4
5. 限流豁免 → §5
6. 验证与回归 → §6

---

## 1. 正确性（P0）

### 1.1 列表无限刷新循环

**现象**：`useCallback` 把 `nextCursor` 放进依赖 + `useEffect(() => load(true), [load])`。第一页返回 `nextCursor` 后 `load` 身份变化 → effect 重触发 → 重置 → 再拉 → 再 set → 死循环。内容超过一页即必现。

**涉及**：`apps/web/src/pages/GalleryPage.tsx:44-72`、`PromptsPage.tsx:47-73`、`apps/admin/src/pages/FeedbackPage.tsx:47-73`。

**方案（标准模式）**：拆分「首载」与「翻页」两个互不耦合的回调 + 请求序号防乱序：

- `loadFirst`：依赖仅过滤器（tab/category/q/status），由 `useEffect` 驱动；内部自增 `seqRef`，响应返回时 `seq` 不等于当前则丢弃（防止快速切换过滤器时旧响应覆盖新数据）。
- `loadMore`：显式闭包 `nextCursor`，只挂「加载更多」按钮，不进任何 effect。
- 两个回调共用 `seqRef`：`loadMore` 读当前 `seqRef.current`，若期间 `loadFirst` 已触发则丢弃翻页结果。

三个页面同构改造。

### 1.2 收藏分页游标错键（第二页必空）

**现象**：`listGenerationFavorites` 游标比较用 `generationFavorites.createdAt`（[content.ts:329](packages/generation-repository/src/content.ts#L329)），但下一页游标编码的是 `last.record.createdAt`（作品创建时间，[content.ts:354](packages/generation-repository/src/content.ts#L354)）。收藏时间恒晚于创建时间 → 第二页恒空。

**方案**（[content.ts](packages/generation-repository/src/content.ts) `listGenerationFavorites`）：
- select 带出 `favoriteCreatedAt: generationFavorites.createdAt` 与 `favoriteRecordId: generationFavorites.recordId`；
- 游标比较改为 `favorites.createdAt < cursor.createdAt OR (= AND favorites.recordId < cursor.id)`；
- `orderBy(desc(favorites.createdAt), desc(favorites.recordId))` 补次级键；
- `encodeCursor({ createdAt: last.favoriteCreatedAt, id: last.favoriteRecordId })`。

### 1.3 收藏列表与详情的可见性不一致

**现象**：收藏列表（[content.ts:323-327](packages/generation-repository/src/content.ts#L323-L327)）不检查 `hiddenAt`，详情检查 → 作者隐藏的作品在收藏列表可见、点开 404。

**方案**：收藏列表补 `isNull(generationRecords.hiddenAt)`；画廊主列表同步补「作者账号被封禁/删除」过滤（见 §3.3），收藏列表一致处理。

---

## 2. 前端健壮性与可访问性（P1）

### 2.1 嵌套按钮（无效 HTML）

**现象**：`GalleryCard` 外层 `<button>` 内嵌三个 `<Button>`（[GalleryPage.tsx:237-259](apps/web/src/pages/GalleryPage.tsx#L237-L259)）。

**方案（标准结构）**：媒体区为独立 `<button>`；操作按钮组作为**同级兄弟**放在定位容器里，容器 `pointer-events-none`、按钮 `pointer-events-auto`。键盘/读屏语义正确，且不会把事件冒泡到外层。

### 2.2 操作按钮只在 hover 出现 → 触屏不可达

**现象**：`opacity-0 group-hover:opacity-100`（[GalleryPage.tsx:247](apps/web/src/pages/GalleryPage.tsx#L247)）；详情弹窗只有点赞没有收藏/同参数。

**方案**：
- 卡片操作按钮**常显**（去掉 hover 透明度切换），并在媒体区加 `group-focus-within` 保证键盘聚焦可见；
- 详情弹窗补齐「收藏」「用同参数生成」按钮（作者本人走 `?reuse=`，他人走文本深链，见 §4.3），作为触屏/键盘的兜底入口。

### 2.3 text 产物破图

**现象**：text 产物落盘成 `.txt`，卡片 [GalleryPage.tsx:242-245](apps/web/src/pages/GalleryPage.tsx#L242-L245) 与详情 [GalleryPage.tsx:312-321](apps/web/src/pages/GalleryPage.tsx#L312-L321) 都把 `readUrl` 塞进 `<img>` → 破图。

**方案**：
- 后端：详情产物投影 `artifactWithReadUrl` 对 `kind === 'text'` 附带 `text` 字段（正文已存 `generation_artifacts.text`，`toGenerationArtifact` 已映射）；`GalleryArtifactSchema` 加 `text?: string`。
- 卡片：text 分类渲染占位（分类图标/提示词摘录），不走 `<img>`。
- 详情：`kind === 'text'` 渲染 `<pre className="whitespace-pre-wrap">{artifact.text}</pre>`。

---

## 3. 治理与生命周期（P2）

### 3.1 admin 社区内容治理

**现状**：admin 只能整用户封禁；无「单独下架一条公开作品」端点；`hiddenAt`/`hiddenBy` 已存在但只有 owner 侧 `setGenerationLibraryState` 使用。

**方案**：

- **repository 层**（[content.ts](packages/generation-repository/src/content.ts)，新增方法并加入 `ContentRepository`）：
  - `listAdminGalleryGenerations({ cursor?, limit?, includeHidden?, q?, authorId? })` —— 含隐藏作品的 admin 视角列表，可按作者/提示词搜索（`inputParamsJson::text ilike %q%`），keyset 分页；
  - `setGalleryRecordHidden({ recordId, hidden, actorId })` —— 写 `hiddenAt`/`hiddenBy`，仅对 public+succeeded 记录，IDOR 不存在抛 `GENERATION_NOT_FOUND`；
  - `hideUserPublicWorks({ userId, actorId })` —— 封禁联动：将该用户所有公开成功且未隐藏记录批量置 `hiddenAt`。
- **admin API**（[admin/routes.ts](apps/api/src/modules/admin/routes.ts)）：
  - `GET /api/admin/gallery`（含 includeHidden/q/authorId 过滤）
  - `POST /api/admin/gallery/:id/hide`
  - `POST /api/admin/gallery/:id/unhide`
  - 均 `requireAdminUser` + 审计（新动作 `admin.gallery.hide` / `admin.gallery.unhide`）。
- **admin 前端**：新增 `GalleryManagePage.tsx`（表格 + 缩略图 + 状态徽标 + 搜索 + 隐藏/恢复操作），注册 `/gallery` 路由 + `AdminShell` 导航入口。复用 keyset 分页模式（同 FeedbackPage）。
- **api-client**：`schemas.ts` 加 `AdminGalleryItem`/`ListAdminGalleryResult` 等；`generation-client.ts` 加 `adminListGallery` / `adminHideGalleryItem` / `adminUnhideGalleryItem`。

### 3.2 封禁联动 + 画廊查询过滤作者状态

**现象**：画廊 join `users` 不过滤 `bannedAt`/`deletedAt`（[content.ts:175](packages/generation-repository/src/content.ts#L175)）。

**方案**：
- `listGalleryGenerations` / `getGalleryGeneration` / `getGalleryArtifact` / `isPublicVisible` / 收藏列表 的 join 统一补 `isNull(users.bannedAt)` + `isNull(users.deletedAt)`（enforcement 层）；
- `adminBanUser` / `adminBatchBanUsers` 成功后调用 `hideUserPublicWorks`（hygiene 层：即使日后解封，作品保持隐藏，admin 可手动恢复）。

### 3.3 审计不对称补齐

**方案**：
- 新增审计动作（三处同步 + 迁移，见 §6.1）：`gallery.visibility-change`（owner 公开/私有切换）、`admin.gallery.hide`、`admin.gallery.unhide`；
- [gallery/routes.ts](apps/api/src/modules/gallery/routes.ts) `PATCH .../visibility`（现未审计）补 `recordApiAuditEvent({ action: 'gallery.visibility-change' })`；
- `DELETE .../like` / `DELETE .../favorite`（现未审计）补 `gallery.like`/`gallery.favorite` 的取消审计（metadata `{ removed: true }`）。

---

## 4. 社区体验与发现（P3）

### 4.1 社交通知（点赞/收藏通知作者）

**现状**：无 notifications 表、无通知 API；`notification` SSE 事件类型在 event-bus 已定义但从未发射，hub 的 `startsWith('generation.')` 过滤器会丢弃；前端通知是本地合成（模型目录/月度用量）。

**方案（标准实现：服务端落库 + API + SSE 实时 + 前端通知中心）**：

- **schema**（[schema.ts](packages/db/src/schema.ts)）新增 `notifications` 表：
  `id, userId(收件人, FK→users onDelete cascade), kind('like'|'favorite'|'system'), actorId(可空, FK→users onDelete set null), recordId(可空, FK→generation_records onDelete cascade), title, body, readAt(可空), createdAt`，索引 `(userId, createdAt)`。
- **repository**（[content.ts](packages/generation-repository/src/content.ts)）：
  `createSocialNotification`（best-effort，失败不影响点赞/收藏）、`listNotifications({ userId, cursor?, limit? })`、`countUnreadNotifications(userId)`、`markNotificationRead({ userId, notificationId })`、`markAllNotificationsRead(userId)`、`getGenerationOwner(recordId)`。
- **点赞/收藏挂钩**（[gallery/routes.ts](apps/api/src/modules/gallery/routes.ts)）：like/favorite **成功后**，若 `owner !== 当前用户`，创建通知（title「收到新点赞/收藏」，body 含动作者昵称与作品 recordId）并向 `deps.generationSseHub` publish `{ event: 'notification', data: { userId: owner, message: 'notification' } }`。重复点赞（onConflictDoNothing 未插入新行）不重复通知。
- **SSE 扩展**：
  - [sse-hub.ts](apps/api/src/modules/generations/sse-hub.ts) `publish` 过滤从 `startsWith('generation.')` 放宽为 `startsWith('generation.') || event === 'notification'`；
  - event-bus `NotificationPayload` 加可选 `userId?: string`（供 hub 分桶；通知事件与 generation 事件共用 `generation:<userId>` 频道）；
  - 前端 [use-generation-events.ts](apps/web/src/hooks/use-generation-events.ts) 增加 `notification` 监听器 → 触发 notifications-store `load()`。
- **API 模块** `apps/api/src/modules/notifications/routes.ts`（注册到 [app.ts](apps/api/src/app.ts)）：
  `GET /api/notifications`、`GET /api/notifications/unread-count`、`POST /api/notifications/:id/read`、`POST /api/notifications/read-all`，均 `requireAuthUser` + 属主校验（只能读/标记自己的）。
- **api-client**：schemas + client 方法。
- **前端 store**（[notifications-store.ts](apps/web/src/stores/notifications-store.ts)）：
  改造 `load()` 拉取服务端通知；保留本地合成项（模型目录/月度用量）追加为 `kind: 'system'`；`unreadCount` = 服务端未读 + 本地未读；`markAllRead` 调 API + 清本地；`openNotification` 对服务端项调 `markNotificationRead`。`NotificationMenu.tsx` 渲染区分类型图标/文案。

### 4.2 画廊发现能力

**后端**（[content.ts](packages/generation-repository/src/content.ts) `listGalleryGenerations` 扩展输入）：
- `q`：提示词/参数内容搜索 → `ilike(generationRecords.inputParamsJson::text, '%q%')`；
- `sort: 'latest' | 'hot'`：hot 按点赞数倒序（子查询 `generation_likes` count，`coalesce(count,0) desc`），次级键仍 `id desc`；
- `authorId`：`eq(generationRecords.userId, authorId)`。
- [gallery/routes.ts](apps/api/src/modules/gallery/routes.ts) `ListGalleryQuerySchema` 加 `q`/`sort`/`authorId`。

**前端**（[GalleryPage.tsx](apps/web/src/pages/GalleryPage.tsx)）：
- 搜索框（q，防抖或提交式）；排序下拉（最新/最热）；模型下拉（暴露既有 `modelId` 过滤）；作者名可点击 → 设置 `authorId` 过滤并显示「只看 TA」筛选条（URL query 同步，便于分享）。

### 4.3 同参数生成：作者本人完整复用参考图

**现状**：`handleReuse` 一律走文本深链（[GalleryPage.tsx:103-105](apps/web/src/pages/GalleryPage.tsx#L103-L105)），参考图丢失。`/create?reuse=<recordId>` 已能完整还原参考图但依赖 owner 作用域端点（`getGeneration`/`getAsset`），仅作者可用。

**方案**（仅前端，无后端改动）：
- `handleReuse` 分支：`useAuthStore().user?.id === item.author.id` → `navigate(/create?reuse=${item.id})`（完整还原）；否则保持 `?select=&params=` 文本深链（隐私边界：他人不能复用作者的私有素材）。
- 详情弹窗「用同参数生成」同样按作者分支。

---

## 5. 社区限流豁免

**方案**（[rate-limit.ts](apps/api/src/lib/rate-limit.ts) `rateLimitRule`）：在返回通用 `write` 桶之前，对社区写端点直接 `return undefined`：

```
/api/gallery（含 /api/gallery/*）
/api/prompt-library（含子路径）
/api/feedback（含子路径）
```

读端点（GET）本就不限流。管理端点（`/api/admin/*`）、auth、generation、upload 保持现有限流。在 `rate-limit.test.ts` 补豁免用例。**注释明确这是有意偏离标准实践（内部工具、无用户），重启用时删除豁免分支即可。**

---

## 6. 数据变更 / 测试 / 验证

### 6.1 一次迁移 `0036`（notifications 表 + 审计动作）

1. [schema.ts](packages/db/src/schema.ts)：新增 `notifications` 表；`audit_logs_action_check` 追加 `gallery.visibility-change` / `admin.gallery.hide` / `admin.gallery.unhide`。
2. `pnpm exec drizzle-kit generate --config packages/db/drizzle.config.ts` 生成 `0036_*.sql`；**手工**在迁移里加 `ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check; --> statement-breakpoint --> ALTER TABLE audit_logs ADD CONSTRAINT ... CHECK (... 新列表)`（drizzle 检测不到已命名 CHECK 表达式变更，参照 `0035_lying_wiccan.sql` 写法）。
3. [audit-types.ts](packages/generation-repository/src/audit-types.ts) 与 [ensure-audit-action-constraint.ts](scripts/db/ensure-audit-action-constraint.ts) 同步追加 3 个动作。
4. dev/test 库：`pnpm run db:push` + `pnpm run db:push:test`（内含 ensure 脚本，自动更新约束）。

### 6.2 测试

| 层 | 用例 | 位置 |
|---|---|---|
| repository | 收藏分页跨页不丢、游标键正确；hiddenAt 一致性（收藏列表过滤隐藏）；admin 画廊列表（includeHidden/q/authorId）；hide/unhide；封禁联动 hideUserPublicWorks；通知创建/列表/已读/未读数；画廊搜索 q/sort hot/authorId 过滤 | `packages/generation-repository/tests/repository.test.ts` |
| api 契约 | 社区端点限流豁免；notifications 路由（列表/未读数/标记已读/越权 404）；admin gallery 端点（非 admin 403） | `apps/api/tests/` |
| 前端纯函数 | deeplink-params 隐私不变量（media 值不入链，回归既有） | 既有 `apps/web/src/lib/deeplink-params.test.ts` |

前端页面行为（循环修复、按钮常显、text 渲染）按仓库约定**不写 UI 测试**，靠 typecheck + 人工验证。

### 6.3 验证流程

```
bun x dotenv -e deploy/env/.env.test -- bun run verify   # 需 test DB: bun run db:test:up
```

含：baseline + boundaries + manifests + typecheck + 全仓测试。改跨包 import 后 `pnpm run check:boundaries` 必跑。schema 变更后 dev/test 两库各 `db:push`。

### 6.4 风险与注意

- `inputParamsJson::text ilike` 搜索在数据量大时走全表，画廊量小可接受；后续可加 GIN/倒排（记录在案，不阻塞本次）。
- 「hot」排序子查询需保证 keyset 游标仍稳定（hot 首次实现以 `(likeCount, createdAt, id)` 复合键游标，或退化为前 N 页无游标——本计划采用带复合键游标，见 §4.2 实现细节）。
- 社交通知 best-effort：通知写失败不影响点赞/收藏（与审计同模式）。
- 生产部署仍待用户确认（「暂时先不部署」约束不变）；本次仅提交代码与迁移文件，不触发 `deploy:prod`。
