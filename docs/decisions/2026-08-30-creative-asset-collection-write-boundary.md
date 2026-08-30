# 生成产物收录的事务边界与幂等协议

- 状态：Accepted
- 日期：2026-08-30
- 范围：`creative-asset-repository`、API creative-assets module、`packages/api-client`、Studio 生成详情页

## 背景

工作台原先先调用“创建资产”，再调用“从生成创建版本”。两次请求之间如果参考图校验、网络或进程发生失败，数据库会留下没有版本的半成品；用户重试时还可能得到重复资产。这是一个跨资源写入问题，不应由页面通过失败后的归档请求补偿。

## 决策

引入单次 `POST /api/creative/assets/collect-from-generation` 操作，应用服务只负责入口编排，repository 负责一个数据库事务内的真实不变量：

1. 校验用户拥有的成功生成和已落存图片产物。
2. 创建创意资产；如果请求带 `projectId`，同时创建项目关系。
3. 创建第一个草稿版本和参考图。
4. 任一步失败，整笔事务回滚。

请求必须带 `Idempotency-Key`（用户范围内 1–256 字符）。服务端对业务输入做稳定序列化并计算 SHA-256 指纹：同一用户、同一 key、同一指纹返回原资产；同一 key 携带不同指纹返回 `CREATIVE_IDEMPOTENCY_CONFLICT`（HTTP 409）。唯一索引负责并发请求的最终竞态收敛，不能只依赖应用层的先查后插。

幂等列只属于该收录命令，普通 `createAsset` 不携带 key，也不改变既有调用语义。客户端在一次表单提交的失败重试期间复用 key；用户修改表单或成功关闭对话框后生成新的 key。

## 文件职责

| 层 | 责任 | 关键文件 |
| --- | --- | --- |
| contracts | 合并请求体 schema，不包含 HTTP header | `packages/creative-asset-contracts/src/index.ts` |
| API route | 认证、body/header 校验、公开响应整形 | `apps/api/src/modules/creative-assets/routes.ts` |
| application service | 注入 repository，保持 HTTP 外可调用 | `apps/api/src/modules/creative-assets/service.ts` |
| repository | 事务、行锁、生成/产物 ownership、指纹和唯一冲突 | `packages/creative-asset-repository/src/repository.ts` |
| repository helper | 仅负责该命令的稳定序列化和 hash，不升级为 shared 万能工具 | `packages/creative-asset-repository/src/idempotency.ts` |
| persistence | 幂等 key/fingerprint 与用户范围 partial unique index | `packages/db/src/schema/creative.ts`、`packages/db/drizzle/0058_kind_toad_men.sql` |
| client/UI | typed client 发送 header；表单重试复用 key | `packages/api-client/src/creative-asset-client.ts`、`apps/studio/src/components/assets/CollectGenerationAssetDialog.tsx` |

## 不在本决策内

- 多资产批量导入的 all-or-nothing 语义（已由后续批量收录计划和第一阶段实现单独承接）。
- 跨资源审计 outbox、操作人可见的恢复记录。
- 复制物理文件、转码或 thumbnail 任务；收录只引用已落存的 `user_assets`。
- 发布/批准动作的幂等键；它应使用版本状态机已有的显式 `publishVersion` 入口单独定义。

## 后续演进

批量命令已经按整批成功或整批失败单独落成 `collect-from-generation/batch`，并以批次表保存顺序、结果索引和批次级幂等指纹；它不改变本决策对单资源入口的边界。

下一项独立工作是定义审计事件如何随业务事务写入 outbox，再由提交后的消费者投递到审计读模型。当前批量收录只引用已经落存的物理资产，没有复制、转码或第三方任务，因此数据库回滚仍是完整恢复机制；一旦引入外部副作用，必须把重试/死信和人工恢复作为 outbox 消费者职责建模。

## 验证

- API route 测试覆盖失败回滚、同 key 重试只生成一个版本、不同 payload 返回 409。
- API client 测试覆盖 endpoint、请求体和 `Idempotency-Key` header。
- 根类型检查通过；相关文件 Biome lint 通过。
