# 文档索引

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [01-assessment.md](01-assessment.md) | 重写前对旧项目的评估（A.优势 / B.问题）——**历史记录** | 了解架构由来 |
| [02-design.md](02-design.md) | 重写设计方案（后端架构 / 包边界 / 前端） | 了解设计决策 |
| [03-ops.md](03-ops.md) | **运维手册**：部署、回滚、查看日志、备份恢复、故障排查、安全基线 | 日常运维 / 查问题 |
| [04-deployment-playbook.md](04-deployment-playbook.md) | **部署手册**：正确部署流程 + 本会话踩坑清单（跨架构/宿主机 nginx/证书 SAN/脚本陷阱等） | **做任何生产部署前必读** |
| [05-community-features.md](05-community-features.md) | **社区化与运营设计**：封禁 / admin 批量操作 / 作品广场 / 提示词库 / 对比生成 / 图生图闭环 / 成本与留存分析 / 反馈通道 | 改上述特性或相关 schema 时 |
| [bailian/PACKAGE_BOUNDARY.md](bailian/PACKAGE_BOUNDARY.md) | **模型知识边界规范**：model-core 唯一数据源归属 + 执行层包边界（对应 `check:boundaries` 可执行版本） | 改包边界 / 改模型 manifest 时必读 |

> 快速入口：CLAUDE.md 已指向 03/04。部署前读 04，运维中查 03。
