# bl-studio 重写评估报告

> **历史记录**：本文件是 2026-08 重写开始前对旧项目的评估，描述的是**当时状态**——
> `apps/web-vue`（Vue 前端）、`bun:test`、工具链「Node 22」等均已不复存在（重写后：单 React
> 前端 + apps/admin、全量 vitest、Node ≥24、pnpm + turbo）。仅作「架构由来」参考，勿据此核对现状。

> 重写对象：bailian-studio（AI 媒体生成全栈 monorepo）与 bailian-hub（模型书架/SDK 仓库）
> 结论先行：**前端从零重写（合并双版本）；后端保留并重构（真实迁移 + 结构性改进）；hub 作为外部依赖保留。**

---

## 一、项目全景

### bailian-studio
AI 媒体生成平台（文生图 / 文生视频 / 音乐 / 文本），核心架构为**任务队列 + 异步轮询**：

```text
Web (web-vue Vue3 生产实现 24k行 / web React 参考实现 15k行)
              │ @bailian-studio/api-client（zod 契约层，双前端共享）
              ▼
        apps/api (Elysia, :5003)
              │ Postgres repository + generation_events outbox + NOTIFY
              ▼
        apps/worker (任务认领 FOR UPDATE SKIP LOCKED → DashScope submit/poll → 产物持久化)
              │
        packages/（14 个共享包：shared/model-core/sse-protocol/db/generation-repository/
                  auth/storage/provider-dashscope/task-engine/bailian-adapter/credit-ledger/
                  media-repository/api-client/design-tokens）
```

- **数据库**：Drizzle，18 张表（8 核心 + 10 支撑），33 个已提交迁移
- **模型**：model-core 45 个 manifest（图像10/视频23/文本7/音频3），manifest 驱动零代码扩展
- **实时**：DB outbox → NOTIFY → API LISTEN → GenerationSseHub → SSE（Last-Event-ID 重放）
- **认证**：cookie + 可撤销 JWT 会话，argon2id 密码哈希，邮箱验证全流程
- **账务**：整数分、冻结/结算/释放、append-only 账本

### bailian-hub
**静态书架 + 构建期 SDK**，非运行时服务。244 份官网原文 + 43 份官方契约 + 50 个维护脚本，产出 `@puzzle-fuzzy/bailian-sdk`（经 bailian-adapter 唯一接入点集成）。**不应并入运行时重写范围。**

---

## A. 保留的优点

### 后端（架构强，保留核心设计）
1. **包边界即架构**——`check-package-boundaries` 可执行门禁；运行时禁止直接 import db；API/Worker 互不依赖；`bailian-adapter` 是外部 SDK 唯一所有者。这是长期可维护性的根。
2. **Manifest 驱动的模型注册表**——新增模型 = 新增 manifest + 注册表一行，provider/service 零改动；加载时深冻结 + 一致性断言，杜绝运行时 mutate。
3. **outbox + NOTIFY + SSE 管线**——DB outbox 是事实来源，NOTIFY 仅作唤醒；SSE `id` 游标重放、Last-Event-ID 补发、bounded buffer（cap 64）防重连重复；`EVENT_CURSOR_EXPIRED`(410) 明确告知前端重拉。
4. **安全姿态**——userId 永不自客户端传入（构造性闭合 IDOR）；CSRF Origin 校验；流式 body 大小守卫；cookie 会话可撤销；argon2id；SSRF-guarded 产物抓取。
5. **分页与幂等**——keyset 游标（版本化 + filter-bound，跨筛选复用被拒绝）；`(userId, idempotencyKey)` 部分唯一索引。
6. **api-client 传输层纪律**——zod 全链路校验、零 `as`；`getCurrentUser` 401→null 语义；登录回跳开放重定向防护（fail-closed）。
7. **账务模型**——整数分、`FOR UPDATE SKIP LOCKED` 冻结、失败不扣费、append-only 账本带余额快照。

### 前端（两版各自的优秀设计，重写时全部继承）
**React 版（apps/web）**
- select 控件用"索引 token"无损承载非 string 枚举值（数组/空串）
- `visibleWhen` 深比较 + 提交前剥离隐藏字段，保留 UI 元数据
- SSE 只做缓存失效（不写数据），坏 payload 静默、心跳忽略
- 登出分层缓存清理（私有根白名单 + 保留公开缓存 + set null 防瞬时暴露）
- `userErrorMessage` 分级本地化（错误码→category→HTTP status），绝不暴露 provider 原文
- `react-window` 虚拟网格 + ResizeObserver 响应式列数
- URL 深链 `?select=` / `?reuse=`；版本化 localStorage 预设

**Vue 版（apps/web-vue）**
- 登出私有数据重置注册表（`registerPrivateDataReset` + `Promise.allSettled`）
- SSE 作为失效提示 + 降级 10s 轮询（状态机 idle/connecting/connected/degraded）
- store 级防竞态：`stateVersion`/`requestEpoch`/`recordRefreshVersions` 防乱序
- 幂等提交：canonicalize payload → 稳定 idempotencyKey
- 参考图提示词富文本双向转换（编辑态中性标记 ↔ `<<<image_N>>>`/`[Image N]`/`图N`）
- `mediaGroups` 跨字段素材数量约束（minItems/maxItems 合计）
- 缩略图自动轮询（queued/processing → 2s 自动刷新）
- 完整认证流：登录/注册弹窗、验证邮箱、重发冷却、忘记/重置密码、修改密码、登出所有设备

---

## B. 需要改进的问题

### 架构层面
1. **双前端并存是最大的架构债务**——生产 Vue + 参考 React，功能分裂（React 无完整认证流/无主题切换，Vue 无虚拟滚动/无 ?reuse 深链/无链路诊断），测试双套，维护成本翻倍。
2. **错误体系统一**——`shared/errors.ts` 自述各层错误（RepositoryError/ProviderErrorInfo/AuthError）未继承统一基类；`ApiClientError` 是又一套形状。
3. **双份类型声明**——api-client 本地重声明 `ModelParameter/ModelCatalogItem/ModelOperation`，与 model-core 各一份，需手工保持同步。
4. **废弃债务**——`/api/usage` 与 `/api/generations/estimate` 响应残留 `finalCents` 废弃别名。
5. **SSE 类型边界**——`GenerationStatus` 排除 repository 内部 `processing` 中间态，线上 status 以不透明 string 流过，类型偏松。
6. **限流/SSE 单实例**——进程内内存限流 + 内存 SSE hub，水平扩展即失效（个人部署可接受，文档标注）。

### 前端代码层面
7. **标签映射分散**——category/kind 中文标签在 labels.ts + GenerationsPage + CreationToolsPanel + AssetPickerDialog + MediaParameterInput 至少 5 处重复。
8. **常量重复**——`THUMBNAIL_REFRESH_MS` 三处；费用分→元格式化两处；密码规则多处内联。
9. **React 版 dead code**——`useLibraryArtifacts` 死代码；30+ 未用 shadcn 组件；dark 模式 CSS 就绪但未接线主题切换。
10. **Vue 版巨型组件**——ModelGenerationForm 2787 行、GenerationTaskDrawer 2089 行，scoped CSS 内多轮设计稿叠加的重复选择器。
11. **硬编码模型 ID**——FunctionsPage 写死 `qwen-omni-screenplay*`/`fun-asr-v1`，不走 manifest，模型下架即坏。
12. **死代码**——Vue 的 `ModelSidebar` 已实现未挂载；React 的若干 client 方法（share/diagnostics/cancel/media-jobs）UI 未消费。

### 工具链
13. **Bun 运行时 + bun:test**——与 pnpm + Node 目标不符；`Bun.password`/`Bun.spawn`/`Bun.file`/`bun --env-file` 需迁移。
14. **hub 双事实源漂移**——model-core 45 manifest vs hub 43 官方契约，靠 CI 构建期对账，存在静默漂移窗口。

---

## C. 重写范围决策（我的判断）

| 部分 | 决策 | 理由 |
|---|---|---|
| 前端（web + web-vue） | **从零重写为单个 React 应用** | 本次重写核心；合并全部功能 |
| 后端（packages + api + worker） | **保留架构 + 真实迁移 + 结构性改进** | 已验证强架构；推倒重来=回归风险+零收益 |
| bailian-hub | **保留为外部依赖** | 静态书架/SDK 维护仓库，非运行时应用 |
| 工具链 | Bun → **pnpm + turbo + Node 22** | 用户明确要求 |

**为什么后端不推倒重来**：后端已有 101 个测试文件、包边界门禁、manifest 一致性断言、并发/恢复测试。重写为"更优雅"的版本需要数天且无法保证行为等价——这与"更健壮、更可维护"的目标相悖。真正的改进来自：运行时迁移（Bun→Node 是真实工作）、错误体系收敛、废弃字段清理、文档重构。
