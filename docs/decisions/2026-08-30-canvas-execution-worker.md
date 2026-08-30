# Canvas 图执行与 Worker 编排决策

## 状态

已接受（2026-08-30）。

## 决策

Canvas 不直接把 React Flow 节点交给 provider，也不把一次运行过程写回编辑快照。API 在用户
请求 `POST /api/canvases/:id/execute` 时，基于当前 `revision` 编译成 provider-neutral 的
`CanvasExecutionPlan`，再创建一个 `canvas.execute` 任务。

执行计划包含：拓扑排序后的媒体节点、模型 ID、已通过 manifest 校验的非媒体参数、静态资产 ID、
以及“媒体参数 → 上游节点”的依赖绑定。编译器是纯包 `@bailian-studio/canvas-execution`，
不读取数据库、环境变量或 URL。

Worker 把每一个计划节点转换为普通 generation。同一依赖层中满足输入条件的节点会在并发上限内
并行创建；默认单个 Canvas 任务最多同时运行 4 个节点。节点生成完成后，Worker 等待 artifact persist
和 `user_assets` 投影就绪，再把稳定资产 ID 写入 `nodeRuns`，随后允许依赖节点创建 generation。
这保留了既有积分、provider 请求审计、重试和资产 ownership 语义，也避免把 provider 临时地址
变成长期任务状态。

## 运行状态与编辑状态

`canvas_documents` / `canvas_document_versions` 是用户编辑状态；`canvas.execute` task 的
`input.nodeRuns` 是某一版本的一次运行状态。Canvas 页面可以把完成的资产 ID 重新显示在节点上，
但服务端不会修改用户当前快照来记录“正在执行”等瞬态状态。

## 第一版边界

- 当前仅执行 `mediaNode`，并要求节点模型类别与节点 `kind` 一致。
- 入边按快照顺序分配到模型 manifest 的 media 参数；上游节点的第一个输出作为下游依赖输入。
- 节点按拓扑层推进，同层节点在并发上限内并行；并发上限由 Worker 组合根配置，默认值为 4。
- API 提供整张 Canvas 任务的幂等取消：只允许取消 queued/running 任务，原子释放租约，并尽力请求已创建的
  子 generation 取消。子 generation 是否能立即停止仍取决于现有 Provider 生命周期。
- `GET /api/canvases/:id/executions/:taskId/events` 提供 Canvas 专属 SSE。API 以短周期读取
  `task_records` 的新 `updatedAt` 快照，只发送变化后的完整 execution summary，不建立独立运行态副本；
  终态事件发送后关闭连接，客户端在 SSE 不可用时降级为任务查询轮询。
- `POST /api/canvases/:id/executions/:taskId/nodes/:nodeId/retry` 从已结束任务派生新的
  `canvas.execute`。服务端通过纯函数计算目标节点及下游失效范围，并复用成功节点的 `assetIds`；原任务
  不原地改写，派生任务带有 `rerun.sourceExecutionId` / `rerun.nodeId` 元数据和独立幂等边界。
- Canvas 页面通过选中节点后的“重跑节点”操作调用该接口，并继续使用 Canvas execution SSE；SSE 不可用时
  使用同一个 fallback polling 实现。
- 普通执行输入携带 `cachePolicy=reuse`，Worker 以 `modelManifestHash + params + resolvedAssetRefs` 生成
  版本化 cache idempotency key，交给已有 generation repository 的用户级幂等边界。只有成功且未软删除的
  结果可被继续复用；失败/取消结果切换到任务级 fresh key，避免坏缓存永久阻塞后续运行。节点级手动重跑
  使用 `cachePolicy=refresh`，保证“重跑”仍然产生新结果。
- 资产 ID 和画布 revision 都在服务端重新校验；客户端不能通过任务查询跨用户读取执行状态。
- `GET /api/canvases/:id/executions` 通过 `task-repository.listTasks` 按用户和任务输入中的 `documentId`
  做 keyset 分页；Canvas 任务同时写入 `recordId=documentId`，新旧任务都能进入同一历史读模型。前端点击历史
  记录时重新读取该执行快照并恢复节点的稳定资产结果，不修改画布编辑快照。
- 生成仓储对首次创建和幂等复用显式返回 `reused`；Canvas Worker 将其固化为节点级 `cacheHit`，并记录
  `worker.canvas.node_cache` 的 hit/miss 指标。执行完成后的历史摘要继续从任务输入投影该字段，旧任务没有该字段
  时保持兼容；因此缓存策略不会复制第二份运行态表，也不会把“命中缓存”混同为“节点已完成”。

后续可在同一任务输入/历史读模型上继续增加节点耗时和失败诊断，但不复制第二份任务状态表。
