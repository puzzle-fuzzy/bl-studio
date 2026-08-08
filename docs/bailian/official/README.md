# 百炼官网文档快照

这里保存由 `pnpm run docs:bailian:sync` 从阿里云百炼官方文档同步来的 Markdown 和来源元数据。

同步范围是百炼 Model Studio 的官方模型 API 参考文档，入口由官方导航接口动态发现。每个文档都记录：

- 官方 URL、导航路径和 Aliyun node ID；
- 官方版本与最后修改时间；
- 同步后的 Markdown SHA-256；
- 同步时间和字节数。

## 同步命令

```bash
pnpm run docs:bailian:sync
pnpm run docs:bailian:check
pnpm run docs:bailian:snapshot:check
```

同步任务只更新 `docs/bailian/official`，不会修改 `packages/model-core` 中的 Manifest、注册表或 operation 映射。

## AI Manifest 处理边界

官方文档快照是后续 AI 生成 Manifest 候选的输入，不是运行时模型目录。推荐流程是：

```text
官网文档快照
  → AI 识别模型与请求契约
  → 生成候选 Manifest
  → 人工审阅参数、传输、输出和价格
  → pnpm run check:manifests
  → 真实 Provider smoke test
  → 单独提交并部署
```

同步失败时保留旧快照；官方导航数量低于安全下限或来源主机不可信时，任务直接失败，不覆盖已有文档。

`docs:bailian:check` 会联网检查官网漂移；`docs:bailian:snapshot:check` 只校验仓库内已有快照、文件路径、来源元数据和 SHA-256，不联网。
