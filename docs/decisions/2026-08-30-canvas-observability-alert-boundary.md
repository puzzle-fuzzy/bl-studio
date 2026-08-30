# Canvas 可观测性告警边界

- 状态：Accepted（先建立基线，再启用阈值告警）
- 日期：2026-08-30
- 前置：Canvas Worker 事件、管理侧运营分析和 Loki/Grafana 看板已落地

## 决策

Canvas 暂不直接在仓库中预置“单次失败即告警”的自动规则。当前流量和失败基线尚未建立，按单事件触发会把偶发 provider 失败、用户取消和低流量窗口混成高噪声告警。先保证事件完整、发布链可验证，再用生产数据确定阈值。

告警候选源只使用已经稳定的 Worker 事件：

- `task.duration` + `taskType=canvas.execute`：每个 Canvas 任务终态一次，适合计算成功率和失败率。
- `canvas.node_failed`：覆盖 generation 创建、依赖解析、generation 状态和 artifact/asset 投影失败，适合按错误码定位节点级故障。
- `canvas.node_generation_queued`：可观察排队和缓存命中，但单独的排队数量不能证明任务卡住。

不从当前 Loki summary 反推 p95，也不把进程内 `MetricsSnapshot` 复制成第二份持久化指标。需要可靠延迟分位数时，后续引入 histogram/exporter，再把告警迁移到指标系统。

## 发布顺序

1. 先执行 `bun run prod:observability:up`，确认四个观测服务、Loki `/ready` 和 Grafana `/api/health` 冒烟通过。
2. 在生产观测栈稳定运行 24–72 小时，记录 Canvas 执行量、终态失败率、节点错误码分布和耗时基线。
3. 以失败率和最小样本数共同触发，而不是以单个失败触发；节点失败告警与整图任务失败告警分开，避免同一次故障重复报警。
4. 告警接收端、webhook 和通知策略由部署环境注入，不把凭据或环境特定联系人提交到仓库。

## 当前边界

Canvas 看板已经纳入 Grafana provisioning，完整生产部署会同步看板，`prod:observability:up` 会在启动后执行端点冒烟；当前仍需要真实目标服务器的 24–72 小时基线，才能合理决定 warning/critical 阈值和通知策略。
