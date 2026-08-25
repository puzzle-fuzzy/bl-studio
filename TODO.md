# bl-studio · 未处理事项

> 最后复核：2026-08-08

当前没有尚未修复的真实缺陷。原审计中已经完成的条目、误报复核记录和历史证据已移除。

以下仅保留尚未落地、但已明确作为后续设计/范围议题的内容：

## 短剧素材平台架构调整

以下方向已经确认，暂不把“整条短剧自动导演”作为平台目标：

- [x] 保留现有 `pnpm + Node + Turborepo`、`apps/api` / `apps/web` / `apps/worker`、PostgreSQL 与 Docker 边界。
- [x] 将 `creative_projects` 定义为素材整理项目；主体、场景、道具、风格资产可以跨项目复用。
- [x] 将 `creative_assets`、资产版本、参考图和生成快照分成不同语义层；版本和引用进入生成后不可原地改写。
- [x] 保持用户负责最终视频的合并、取舍、节奏和镜头切换，平台只保证单步素材生成和稳定引用。
- [ ] 将创意资产协议从万能 `@bailian-studio/shared` 提取为独立 contracts/domain 包，并完成唯一事实来源迁移。
- [ ] 在资产 API 路由与 repository 之间增加 service/use-case 层，集中处理权限、校验、状态和编排。
- [x] 实现 Provider-neutral compiler：将已批准资产版本、用户提示词和模型 manifest 编译为稳定的生成参数、媒体引用和不可变快照；当前已完成纯 compiler 包，尚未接入生成提交入口。
- [ ] 将 compiler 接入生成提交 service/repository，完成资产版本、参考图和 generation record 的原子快照写入。
- [ ] Provider 编译遇到多个同类型媒体槽位时必须返回结构化歧义错误，禁止自动猜测首帧/尾帧等语义。
- [ ] API Client 增加项目、资产、版本、参考图的类型化接口。
- [ ] Web 增加按项目整理的资产工作台；在页面稳定后再补页面级 E2E。
- [ ] 后续再规划剧本上传/生成与人物、场景、道具提示词分析，不把剧本逻辑塞进资产 repository 或 Provider executor。

当前执行顺序：compiler 生成提交接入 → API Client → Web 资产工作台；本阶段不修改导演、剧本和剪辑流程。

## 后续设计议题

- **会话滑动续期**：当前采用 7 天绝对 TTL；滑动续期需要先确定完整的会话策略，再评估引入的认证状态复杂度。
- **错误类型跨层统一继承**：当前各业务层保留独立错误类型，文档已按实际架构修订；统一继承 `BailianStudioError` 作为未来架构演进，不是当前缺陷。
- **扩大 Web 覆盖率范围**：当前 `test:coverage` 门禁覆盖 `apps/web/src/lib/**`；待 stores/hooks 补齐组件级测试后，再扩大覆盖范围。
