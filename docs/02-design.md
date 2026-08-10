# bl-studio 重写方案设计

## 一、技术决策

| 项 | 决策 | 理由 |
|---|---|---|
| 包管理 | **pnpm 10 + turbo 2** | 用户要求；整体都使用 pnpm |
| Node 运行时 | **Node ≥ 24** | 用户要求；`import.meta.main` 原生可用 |
| API 运行时 | **Bun（唯一例外）** | 用户要求；Elysia 在 Bun 下走原生 Bun.serve，Node 下会退回不支持 listen 的 WebStandard adapter |
| Worker 运行时 | Node + **tsx** | 整体使用 pnpm 的体现 |
| 测试 | **Vitest 4（全仓统一，Node 上运行）** | bun:test → vitest，前后端同一工具链；与运行时解耦 |
| 前端框架 | React 19 + TypeScript strict + Vite 8 | 用户要求 |
| 前端状态 | **zustand**（客户端/全局状态）+ 纯函数业务逻辑层 | 用户要求；SSE 失效驱动 |
| 路由 | react-router 8（data router） | 用户要求 |
| UI | **shadcn/ui（radix 系）+ Tailwind CSS 4**（`shadcn add --all` 全量） | 用户要求；能用的地方尽量用 |
| 虚拟滚动 | react-window v2（任务列表 + 资产网格） | 用户要求；原 React 版已验证 |
| 反馈 | sonner（toast）+ 通知中心 | 合并 Vue 通知 + React toast |
| 图标 | lucide-react | 两版统一 |
| 密码哈希 | **@node-rs/argon2**（替换 Bun.password） | 跨运行时 argon2id 绑定，Bun/Node 均可用 |
| 后端框架 | Elysia（保留） | Bun 原生性能路径，已验证 |
| ORM | Drizzle（保留） | 已验证 |
| 代码质量 | Biome lint + tsc --noEmit typecheck | Biome 负责 TS/TSX/JS 规则；tsc 负责类型正确性 |
| 前端测试 | **只测纯函数层，不测 UI/样式** | 用户要求；样式后续还会调整，UI 测试是噪音 |

## 二、目标目录结构

```text
bl-studio/
├── package.json              # pnpm root + turbo
├── pnpm-workspace.yaml       # packages + catalog（共享版本）
├── turbo.json                # dev/build/typecheck/test 任务
├── tsconfig.base.json        # strict 全开
├── .npmrc / .gitignore / .dockerignore
├── README.md                 # pnpm 启动指南
├── CLAUDE.md                 # 面向 AI 助手的仓库指南
├── docs/                     # 评估报告、设计、迁移说明
├── apps/
│   ├── web/                  # ★ 合并后的 React 前端（从零重写）
│   ├── api/                  # Elysia（Bun→Node 迁移 + 改进）
│   └── worker/               # 任务 worker（Bun→Node 迁移 + 改进）
├── packages/                 # 15 个共享包（迁移 + 改进）
├── infra/
│   ├── env/                  # .env.example/.env.test.example/.env.production.example
│   ├── docker/               # Dockerfile（node+pnpm）、compose
│   ├── nginx/                # 单前端反代
│   └── scripts/              # 运维脚本（Bun→Node/tsx）
├── tests/                    # 根级契约/脚本测试
└── e2e/                      # Playwright（单前端）
```

## 三、前端架构（apps/web）

### 状态分层
```text
┌─ 纯函数层（无副作用，可单测）─────────────────┐
│ lib/parameter-form-schema.ts  参数→控件投影      │
│ lib/reference-format.ts       提示词引用双向转换 │
│ lib/creation-presets.ts       预设（版本化）     │
│ lib/labels.ts                 统一标签映射       │
│ lib/money.ts                  分→元              │
│ lib/user-error.ts             错误本地化         │
└───────────────────────────────┬─────────────────┘
┌─ zustand 客户端状态（SSE/API 驱动）────────────┐
│ stores/auth.ts                会话 + 登出清理    │
│ stores/model-catalog.ts       模型目录          │
│ stores/generations.ts         任务列表/游标/筛选  │
│ stores/generation-artifacts.ts 按 record 产物    │
│ stores/assets.ts              资产（query-keyed）│
│ stores/credits.ts             积分余额           │
│ stores/notifications.ts       官方通知 + toast   │
└───────────────────────────────┬─────────────────┘
┌─ 接入层 ───────────────────────────────────────┐
│ hooks/use-generation-events.ts  SSE 失效驱动    │
│ lib/api.ts                     apiClient 单例    │
└────────────────────────────────────────────────┘
```

- **SSE 只做失效**：事件携带 recordId → 触发 `refreshRecord(id)` 拉详情 + 相关缓存失效，不写数据（继承两版最佳实践）。
- **登出清理**：`registerPrivateReset` 注册表 + `resetPrivateData()`（继承 Vue 版模式）。
- **防竞态**：`requestVersion`/`refreshVersion` 序号丢弃过期响应（继承 Vue 版模式）。
- **幂等提交**：canonicalize payload → 稳定 idempotencyKey（继承 Vue 版，并修复原版"只存最近一次"的缺陷：payload 指纹缓存）。

### 路由清单（合并两版路由，无 Vue）
| 路径 | 鉴权 | 功能 |
|---|---|---|
| `/` | — | 重定向 `/create` |
| `/create` | 需登录 | 创作工作台（意图→类别→模式→模型 + 动态参数 + 预设 + 预估） |
| `/catalog` | 需登录 | 模型目录 |
| `/generations` | 需登录 | 渲染队列（状态筛选 + 虚拟滚动 + SSE 实时） |
| `/generations/:id` | 需登录 | 详情（成品/输入/诊断/分享/取消/重跑） |
| `/functions` | 需登录 | 辅助工具（剧本/提取音频/转写） |
| `/library` | 需登录 | 资产库（虚拟网格 + 上传进度 + 预览） |
| `/gallery` | 需登录 | 社区画廊（点赞/收藏/同参数生成/详情预览）——社区化特性后新增 |
| `/prompts` | 需登录 | 提示词库（服务端命名库，保存/复用）——社区化特性后新增 |
| `/login` | 访客 | 登录/注册（全局 AuthDialog） |
| `/auth/verify-email` / `/auth/check-email` | 访客 | 邮箱验证 |
| `/auth/forgot-password` / `/auth/reset-password` | 访客 | 密码重置 |
| `/share/generations/:shareId` | 公开 | 公开分享只读页 |

### 功能合并矩阵（React ⇄ Vue 双向补齐）
| 功能 | React 版 | Vue 版 | 合并后 |
|---|---|---|---|
| 创作工作台 | ✓ | ✓ | ✓（合并，保留 React 布局 + Vue 表单增强） |
| 完整认证流 | 部分 | ✓ | ✓（补齐 forgot/reset/change-password） |
| 积分余额 | ✗ | ✓ | ✓（新增 CreditsBadge + 账户菜单） |
| 通知中心 | ✗ | ✓ | ✓（新增 NotificationMenu） |
| 主题切换 | ✗（CSS 就绪未接线） | ✓ | ✓（新增 ThemeToggle） |
| 任务画廊/抽屉 | 详情页 | ✓ | ✓（合并为详情 modal + 画廊） |
| 隐藏/删除/恢复 | ✗ | ✓ | ✓（library-state 操作） |
| 虚拟滚动 | 资产库 | ✗ | ✓（扩展至任务列表） |
| ?select=/?reuse= 深链 | ✓ | ✗ | ✓ |
| 链路诊断 | ✓ | ✗ | ✓ |
| 上传进度/取消 | ✗ | ✓ | ✓ |
| 缩略图自动轮询 | ✗ | ✓ | ✓ |

### 关键实现要点
1. **manifest 驱动表单**：继承 React select-token 方案 + Vue 的 `mediaGroups` 约束 + `visibleWhen` 深比较。
2. **多参考图编辑器**：继承 Vue 的"编辑态中性标记 ↔ provider 语法"双向转换 + React 的镜像 div 光标定位。
3. **任务实时**：SSE 失效 + 降级轮询 + `recordRefreshVersions` 防乱序。
4. **资产上传**：XHR 进度 + AbortController 取消 + MIME 校验（Vue 模式）。
5. **费用预估**：350ms 防抖 + 序列号丢弃过期（继承两版）。
6. **主题**：`next-themes` + Tailwind v4 oklch 变量（React 版 CSS 已就绪，接线切换器）。

## 四、后端改造

### 4.1 运行时迁移（Bun → Node，真实工作）
| 原 Bun API | 迁移目标 |
|---|---|
| `Bun.password.hash/verify`（argon2id） | `@node-rs/argon2`（argon2id） |
| `Bun.spawn`（媒体处理 2 处） | `node:child_process.spawn`（封装 `runProcess` 工具） |
| `Bun.file`（design-tokens 测试） | `node:fs` |
| `Bun.env` | `process.env` |
| `bun:test`（101 文件） | `vitest`（机械替换 + 逐文件修正） |
| `bun --env-file=...`（dev 脚本） | `dotenv-cli`（或 Node `--env-file`） |
| `bun run` / `bun x`（scripts） | `pnpm` / `pnpm exec` |

### 4.2 结构性改进（有意义的架构调整）
1. **错误体系（按现状如实描述，收敛推后）**：共享主干只有 `BailianStudioError`（`code`/`retryable`/`metadata`，实际仅 `ValidationError` 继承）。各业务层各自定义错误类并 `extends Error`：`GenerationRepositoryError`/`AuthError`/`CreditLedgerError`/`MediaRepositoryError`/`ModelCoreError`/`ApiClientError`/`DashScopeHttpError`；`ProviderErrorInfo` 是 **interface**。层间一致性靠**集中映射**而非统一继承：`apps/api/src/lib/http-errors.ts` 用 `instanceof` 逐一映射到 HTTP 状态与响应体，各层 `code` 是带完整 union 的稳定字符串（`Record<Code, number>` 覆盖完整联合，新增 code 未映射即编译报错），未分类错误走兜底 `INTERNAL_ERROR`——**绝不透传 `message`/`cause` 原文给客户端**（R2-P0-03，原文只进服务端日志经值级脱敏）。跨层统一继承留待后续（届时把各层子类迁到继承 `BailianStudioError` 并补回 `shared/errors.ts` 子类）。
2. **清理废弃字段**：移除 `/api/usage` 与 `/api/generations/estimate` 响应的 `finalCents` 别名，同步更新 api-client schema 与测试。
3. **类型收敛**：`api-client` 的本地类型声明改为从单一契约模块导出（不破坏包边界：契约类型留在 api-client，model-core 通过 `catalog.ts` 投影在结构上满足）。
4. **SSE 类型精化**：为 `generation.status` 载荷的 status 保留字符串联合，但前端解析分支固定（`recordMatchesGenerationViews` 迁移为纯函数）。
5. **限流/SSE 单实例**：文档标注为"个人部署假设"，不在本次扩展（标注"建议人工复核"）。

### 4.3 保留不变
- 包边界门禁、manifest 注册表、outbox+SSE 管线、keyset 游标、账务模型、安全姿态（IDOR/CSRF/body guard）。
- drizzle schema 与全部已提交迁移（数据兼容是硬约束）。当前迁移已到 `0035`（36 个，`0000–0035`）；生产只走 `drizzle-kit migrate`（已提交迁移文件），schema 变更一律以**追加迁移**实现，不跑 `db:push`。

## 五、基础设施

- **Docker**：`oven/bun:1.3.14-debian` 基座 + 官方二进制 **Node 24**（apt 的 v20 缺 `import.meta.main`，会让 worker 静默退出）+ pnpm + tsx 直跑源码 + ffmpeg；web 单独构建到 nginx:1.27-alpine。**不使用 Caddy**——HTTPS 由宿主机 nginx + certbot 终止。
- **Nginx**：单 `apps/web/dist`，/api 反代 + SSE 反代配置不变（去掉 5004 相关）。
- **env 模板**：`AUTH_PUBLIC_WEB_ORIGIN` 默认改为 `http://localhost:5002`；CORS 默认仅 `localhost:5002`。
- **Compose**：dev/test 双 Postgres（:55431/:55432）+ Mailpit，保留原端口。

## 六、测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 纯函数（前端） | vitest | parameter-form-schema / reference-format / creation-presets / labels / user-error / 错误映射 |
| 前端集成 | vitest + happy-dom + Testing Library | 路由守卫 / auth 流 / 任务抽屉 / 画廊 / 重试回填 |
| 后端包 | vitest（node） | 原 101 个 bun:test 全量迁移 + 新增 |
| API 契约 | vitest | routes 测试（保持原 api-success-contract） |
| 门禁 | turbo | typecheck + test + check:boundaries + check:manifests + production-env |

## 七、验收清单

- [ ] `pnpm install` 成功，无 bun 残留依赖
- [ ] `pnpm typecheck` 全仓通过
- [ ] `pnpm test` 全仓通过（vitest）
- [ ] `pnpm check:boundaries` / `check:manifests` 通过
- [ ] 前端 `pnpm dev`（web:5002 + api:5003 + worker）可跑通创作→生成→SSE→资产闭环
- [ ] 无任何 `bun:test` / `Bun.*` / `apps/web-vue` 残留
