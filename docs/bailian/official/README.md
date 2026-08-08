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

同步现在按文档逐个原子保存：某个页面成功后，其 Markdown、registry 和来源状态会立即 checkpoint。
如果后续页面失败，已保存文档会保留，`sync-state.json` 会标记为 `status: partial`，并记录
`documentCount/expectedDocumentCount`；这类快照不会被 `docs:bailian:snapshot:check` 当作完整快照。
下一次同步会比较当前官网导航；导航未变化时会校验并跳过已保存文档，从上次断点继续，导航变化时重新抓取受影响文档，全部成功后才标记为 `status: complete`。
验证码页、官方导航数量低于安全下限或来源主机不可信时，任务直接失败，并且不会把失败响应写入文档。

`docs:bailian:check` 会联网检查官网漂移；`docs:bailian:snapshot:check` 只校验仓库内已有快照、文件路径、来源元数据和 SHA-256，不联网。
