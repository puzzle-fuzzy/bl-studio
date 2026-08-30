# Canvas 图执行与 Worker 编排决策

## 状态

已接受（2026-08-30）。

## 决策

Canvas 不直接把 React Flow 节点交给 provider，也不把一次运行过程写回编辑快照。编辑快照只保留
提示词、模型、连接关系和稳定资产引用；节点 `status`、错误文本等运行态由当前页面/执行任务恢复。
API 在用户
请求 `POST /api/canvases/:id/execute` 时，基于当前 `revision` 编译成 provider-neutral 的
`CanvasExecutionPlan`，再创建一个 `canvas.execute` 任务。

Canvas 同时保留节点卡片上的单节点快捷生成，用于快速试错；它直接创建普通 generation，不进入
`canvas.execute` 的 `nodeRuns` 和运行记录。单节点 generation ID 作为可恢复指针随节点快照保存，页面刷新后恢复轮询；
历史快照没有该 ID 时降级为可编辑状态。两条入口共享资产 ID、模型校验和结果持久化，但页面保证互斥：
整图任务执行期间禁用单节点提交，单节点生成期间禁用“运行画布”，避免两个生命周期竞争写回同一个节点结果。
需要完整拓扑、缓存、节点级重跑和统一运行记录时，应使用整图入口。

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
- Canvas 静态参考素材在编辑快照中保存稳定 ID 及其媒体类型；选择器按当前模型 manifest 的 media 参数加载图片/视频
  资产，并按同一媒体类型各参数 `maxItems` 之和限制可选数量。模型切换后，选择器仍按 ID 加载历史已选项（详情不可用时保留
  可移除占位项），让旧类型绑定可以恢复；历史快照若超过容量，编译器仍防御性截断，但页面会明确提示“参考槽位不足或类型
  不匹配”，要求用户减少素材或更换模型。Worker/API 仍以服务端资产实际类型为最终校验。这样视频节点使用首尾帧图片、
  参考视频等多输入模型时，不会被节点输出类型错误限制，也不会把超量或旧类型素材静默当成有效输入。

- Worker 在节点 generation 创建时把 `startedAt` 写入 `nodeRuns`，在成功或失败时补齐 `completedAt`、`durationMs` 和稳定
  `errorCode`；节点等待资产投影时保留开始时间，不会把轮询等待重复计入多个执行区间。
- API 从 `task_records.startedAt/completedAt/errorJson` 投影整图执行诊断，并从 `nodeRuns` 投影节点诊断；历史读模型和 SSE
  复用同一套字段，旧任务缺少字段时保持兼容。Canvas 历史面板显示总耗时、失败节点数量和任务错误码，节点错误提示保留错误码。
- 节点耗时同时进入 Worker 进程内 timing 指标，后续可接入外部指标后端；本阶段不复制第二份任务状态表。
- Canvas 父任务与实际创建的子 generation 共用任务 `traceId`，管理侧成本分析据此关联 `task_records` 与 `generation_records`；
  `nodeRuns.cacheHit` 只统计缓存复用次数，不再次计入 generation 成本。该分析先复用现有表结构，不新增成本明细表；节点和
  单次执行钻取通过 admin 读模型关联已有 generation 与 `user_assets`，不复制成本或 Canvas 运行态表。
- 管理任务详情沿用 `/api/admin/tasks/:id/request-context`，对合法的 `canvas.execute` 返回带
  `kind="canvas"` 的节点级诊断、费用投影和批量回溯的输出资产元数据；只有子 generation 的 `traceId` 与父任务一致、且节点未命中缓存时才核算费用。
  存储坐标只在 API 层转换为短期预览 URL，不进入 wire。这样 admin 可以定位单次执行和输出资产而不读取用户侧权限接口，也不新增 Canvas 专用运行态表。
