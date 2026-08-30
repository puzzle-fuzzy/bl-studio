# 文档索引

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [01-assessment.md](01-assessment.md) | 重写前对旧项目的评估（A.优势 / B.问题）——**历史记录** | 了解架构由来 |
| [02-design.md](02-design.md) | 重写设计方案（后端架构 / 包边界 / 前端） | 了解设计决策 |
| [architecture/creative-asset-platform.md](architecture/creative-asset-platform.md) | 当前创意资产、生成快照、Worker 与进程资源生命周期架构基线 | 进行跨模块架构调整前必读 |
| [decisions/2026-08-30-creative-asset-collection-write-boundary.md](decisions/2026-08-30-creative-asset-collection-write-boundary.md) | 生成产物收录的事务边界、幂等协议和下一阶段批量写入计划 | 修改收录 API、资产版本写入或幂等语义时 |
| [decisions/2026-08-30-creative-asset-audit-outbox-boundary.md](decisions/2026-08-30-creative-asset-audit-outbox-boundary.md) | 收录审计 outbox 的事务、一致性、Worker 消费与恢复边界 | 修改收录审计、outbox 或重试语义时 |
| [plans/2026-08-30-creative-asset-batch-collection.md](plans/2026-08-30-creative-asset-batch-collection.md) | 多资产收录的批次级幂等、全有或全无事务和恢复边界草案 | 开始实现批量收录前或调整恢复语义时 |
| [03-ops.md](03-ops.md) | **运维手册**：部署、回滚、查看日志、备份恢复、故障排查、安全基线 | 日常运维 / 查问题 |
| [04-deployment-playbook.md](04-deployment-playbook.md) | **部署手册**：正确部署流程 + 本会话踩坑清单（跨架构/宿主机 nginx/证书 SAN/脚本陷阱等） | **做任何生产部署前必读** |
| [05-community-features.md](05-community-features.md) | **社区化与运营设计**：封禁 / admin 批量操作 / 作品广场 / 提示词库 / 对比生成 / 图生图闭环 / 成本与留存分析 / 反馈通道 | 改上述特性或相关 schema 时 |
| [bailian/PACKAGE_BOUNDARY.md](bailian/PACKAGE_BOUNDARY.md) | **模型知识边界规范**：model-core provider-neutral 契约、provider manifest owner 与执行层包边界（对应 `check:boundaries` 可执行版本） | 改包边界 / 改模型 manifest 时必读 |

> 快速入口：CLAUDE.md 已指向 03/04。部署前读 04，运维中查 03。
