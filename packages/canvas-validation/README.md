# @bailian-studio/canvas-validation

Canvas 提交前预检的共享纯函数包。

它复用 `canvas-contracts` 的图数据规则和 `model-core` 的 manifest 校验，向前端提供节点级、字段级错误反馈；服务端可以复用同一套反馈语义。它不负责用户鉴权、资产 ownership、revision、任务入队或 provider 请求，API 的最终校验仍由服务端完成。

```bash
bun run --cwd packages/canvas-validation typecheck
bun run --cwd packages/canvas-validation test
```
