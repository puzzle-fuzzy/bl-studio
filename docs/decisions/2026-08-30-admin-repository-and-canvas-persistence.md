# Admin Repository 与 Canvas 持久化决策

## 状态

已接受（2026-08-30）。

## 决策

### Admin Repository

后台画廊治理、任务排障和成本/留存分析从 `generation-repository` 物理迁移到
`@bailian-studio/admin-repository`。它只暴露后台读模型和治理 port，不拥有任务生命周期，
也不依赖 HTTP、Provider 或前端。API 组合根通过 `adminRepository.gallery`、
`adminRepository.tasks` 和 `adminRepository.analytics` 注入组合根，路由不再依赖三个扁平字段。

Canvas 任务详情继续复用 `AdminTaskRepository` 的请求上下文接缝：`canvas.execute` 以
`kind="canvas"` 返回节点级只读投影，并用父任务 `traceId` 校验子 generation 的费用归属；节点
输出资产由同一查询批量回溯到 `user_assets`，API 只在响应层生成短期预览 URL，不把存储坐标带
到 wire；不为管理详情复制一张 Canvas 运行态表。

这样做的原因是 admin 查询天然跨越 users、generations、assets 和 tasks；将它们留在生成
生命周期 repository 会持续扩大核心接口，也会让后台权限边界混入普通生成流程。任务中心在
此边界上按任务域和状态筛选，Canvas 任务可直接进入节点级只读详情，不需要让前端拼接多个
业务域的接口。

### Canvas 文档

Canvas 使用两张表：

- `canvas_documents` 保存当前快照、标题和单调递增的 `revision`；
- `canvas_document_versions` 保存每次成功保存的完整快照，版本不可变。

保存必须携带 `expectedRevision`。服务端用条件更新实现乐观并发控制；冲突返回
`CANVAS_REVISION_CONFLICT`（HTTP 409），客户端不自动覆盖另一个标签页的修改。
恢复历史版本不是回写旧行，而是以当前 revision 创建一个新版本，因此历史记录保持完整。

快照协议只保存 React Flow 的稳定子集和节点业务数据。生成产物、参考素材均通过稳定的
资产 ID 关联；签名 read URL 只在读取时由资产接口重新解析，避免过期 URL 污染版本历史。

### 素材选择器

Canvas 素材选择器复用现有 `/api/assets` 用户范围接口，按节点媒体类型过滤。选择结果写入
`referenceAssetIds`，生成时再结合模型 manifest 的 media 参数映射到 `assetRefs`。这样手动
选择和节点连线使用同一套资产 ID 协议，也保留了 ownership 和模型能力校验。

## 后续边界

当前版本完成文档级持久化和版本恢复；执行能力由独立的 `canvas.execute` 编排任务承接，
不污染保存接口。后续再考虑历史版本分页、命名画布列表、离线队列和多用户实时协作。
这些能力不应提前塞入当前保存接口。
