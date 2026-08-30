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

Worker 把每一个计划节点转换为普通 generation。节点生成完成后，Worker 等待 artifact persist
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
- 节点按拓扑顺序串行推进，尚未做同层并行调度、取消整张画布、SSE 进度推送或节点级重跑。
- 资产 ID 和画布 revision 都在服务端重新校验；客户端不能通过任务查询跨用户读取执行状态。

下一阶段可在不改变当前 generation 语义的前提下增加并行分支、执行取消、实时事件流和节点级重跑。
