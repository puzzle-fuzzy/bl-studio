# 多资产收录：批次级事务与恢复边界

- 状态：In progress（repository/API/client、审计 outbox、管理员恢复 API 与 Grafana 运营视图第一阶段已完成，Studio 多选待接线）
- 日期：2026-08-30
- 前置：单资源 `collect-from-generation` 已完成并作为事务基元

## 目标

支持用户一次从多个已落存生成产物创建多个创意资产，同时保持“不会留下半成品、可安全重试、错误可解释”。本计划只处理资产域写入，不把批量收录变成自动导演或后台长期任务。

## 推荐契约

```http
POST /api/creative/assets/collect-from-generation/batch
Idempotency-Key: <batch-key>
```

```json
{
  "items": [
    {
      "type": "character",
      "name": "林默",
      "projectId": "optional-project-id",
      "sourceGenerationId": "generation-id",
      "semanticSpec": {},
      "generationRecipe": { "source": "generation" },
      "references": [{ "artifactId": "artifact-id", "role": "front", "position": 0, "metadata": {} }]
    }
  ]
}
```

- `items` 建议限制为 1–50；批次中的顺序属于请求语义，顺序变化视为不同指纹。
- `Idempotency-Key` 是用户范围的批次 key，不能复用到不同 payload。
- 同一用户、同一 key、同一批次指纹：返回原批次及资产 id 列表。
- 同一用户、同一 key、不同指纹：返回 `CREATIVE_IDEMPOTENCY_CONFLICT`（409）。
- 任何一个项目、生成记录、产物、角色兼容性或版本写入失败：整批回滚，响应返回结构化错误；失败批次不占用 key，修正 payload 后可重新提交。

## 持久化形态

单资源幂等列不适合承担批次结果索引。建议新增两个资产域表：

1. `creative_asset_collection_batches`：`id`、`user_id`、`idempotency_key`、`request_fingerprint`、创建/更新时间；`(user_id, idempotency_key)` 唯一。
2. `creative_asset_collection_batch_items`：`batch_id`、`item_index`、`asset_id`；`(batch_id, item_index)` 唯一，并保存返回顺序。

批次表、批次项、资产、项目关系、版本和参考图必须在同一 PostgreSQL transaction 内写入。唯一索引负责并发竞态收敛；应用层的“先查询再插入”只能优化常见路径，不能作为一致性保证。

## 应用分层

- contracts：定义 batch body 和单项复用的 schema，不接触数据库字段。
- API service：接收认证 principal，调用一个 `collectAssetsFromGenerationBatch` use case。
- repository：先锁定已存在的批次；不存在时按 item 顺序复用单项校验/写入基元，并在一个事务中登记批次结果。该第一阶段已落地。
- API client：显式要求 `idempotencyKey`，不让调用方忘记幂等语义。该第一阶段已落地。
- Studio：多选收录时生成一个批次 key；失败重试复用 key，修改选择后生成新 key。多选 UI 接线仍待完成。

## 审计与恢复

all-or-nothing 事务成功后再写一条批次级审计 outbox 事件，事件中只放批次 id、数量和结果摘要，不写 prompt、storage key 或完整请求体。事务失败时不写“部分成功”审计。

由于当前批次不包含外部副作用，数据库回滚本身就是恢复机制，不新增 `recovery` 状态。若未来收录触发复制、转码或第三方任务，必须把这些副作用改为事务提交后的 outbox 消费，并为 outbox 消费单独定义重试/死信状态，不能把外部状态塞进资产事务。

## 实施顺序

1. ✅ 新增 contracts/types、批次表迁移和 repository 并发/回滚测试。
2. ✅ 接入 API service、route 和 api-client；保留当前单资源 endpoint 兼容旧调用。
3. 最后改 Studio 多选入口，并验证批次失败重试与登录态切换。
4. ✅ 审计 outbox 已单独落成 producer/consumer 小切片；审计动作枚举、事件 payload 和资产写入没有混入同一重构。
5. ✅ admin API 已提供失败列表与终态失败人工重放；重放动作本身写入管理员审计。
6. ✅ Worker 已输出审计 outbox 失败量/延迟/异常指标，并通过现有 Loki/Grafana 观测栈提供运营视图。

## 暂不做

- 部分成功批次。
- 跨生成任务的自动聚合或自动命名。
- 批量发布/批准版本。
- 把 batch idempotency 泛化为 shared 包的通用 JSON hash 工具。
