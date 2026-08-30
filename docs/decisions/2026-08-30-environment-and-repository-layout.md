# 环境文件与仓库布局决策

## 决策

环境文件统一放在 `deploy/env/`，只提交一个最基础的模板：

```text
deploy/env/
├── .env.example   # 唯一提交的模板，不含凭据
├── .env.dev       # 本地开发，gitignored
├── .env.test      # 测试与 CI 本地覆盖，gitignored
└── .env.prod      # 生产应用、基础设施、备份和部署配置，gitignored
```

`.env.prod` 是生产 Compose 的唯一变量入口。备份服务不再生成独立的
`.env.prod-backup`，Compose 只显式投影 backup 所需的变量，避免把 API、Worker、SMTP
等应用机密扩散给备份容器。

## 根目录职责判断

下列目录不迁移到 `deploy/`，因为它们不是部署声明：

| 路径 | 职责 | 处理 |
|---|---|---|
| `var/` | 本地运行时目录、上传文件、临时媒体与静态 ffmpeg | 保留在根目录；数据不应与部署代码耦合 |
| `tools/` | 独立的开发工具与本地文档采集工具 | 保留；属于开发工具链 |
| `tests/` | 跨应用契约测试与 Playwright E2E | 保留；根级测试是 monorepo 常见布局 |
| `test-results/` | Playwright 生成的结果 | 保留并 gitignore；属于测试工具默认输出 |
| `scripts/` | db、deploy、docs、verify、backup、dev 工作区自动化 | 保留；脚本需要从仓库根目录运行并服务多个环境 |
| `deploy/` | Docker、Compose、Nginx、可观测性和部署环境文件 | 保留为部署声明边界 |
| `data/` | 可提交的 fixture 与种子输入 | 保留；它是应用输入数据，不是部署配置 |
| `playwright.config.ts` | 工作区唯一 Playwright 配置 | 保留根目录，匹配 `tests/e2e/` 与 CI 调用方式 |

这样做符合“按生命周期和职责分层”的实践：部署配置集中，但运行时数据、开发工具、
测试资产和业务 fixture 不会被误认为可发布资源，也不会因为部署目录层级变化而改变
工作区脚本的根路径计算。

## 迁移边界

- 所有 Bun、Node、Vite、测试、数据库和部署入口都使用 `deploy/env/.env.*`。
- 真实环境文件一律不提交，权限在本地/服务器侧收紧为 `600`。
- 不删除 `var/` 中可能属于用户的运行时数据，也不移动 `data/fixtures/` 这类已版本化输入。
- 远程生产布局为 `$DEPLOY_REMOTE_DIR/deploy/{env,docker,nginx,observability,scripts}`；
  生产环境文件不再放在远程目录根部。
