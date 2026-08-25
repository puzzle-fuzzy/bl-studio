# bl-studio · 未处理事项

> 最后复核：2026-08-25

当前没有尚未修复的真实缺陷。原审计中已经完成的条目、误报复核记录和历史证据已移除。

以下仅保留尚未落地、但已明确作为后续设计/范围议题的内容：

## 短剧素材平台架构调整

以下方向已经确认，暂不把“整条短剧自动导演”作为平台目标：

- [x] 保留现有 `pnpm + Node + Turborepo`、`apps/api` / `apps/web` / `apps/worker`、PostgreSQL 与 Docker 边界。
- [x] 将 `creative_projects` 定义为素材整理项目；主体、场景、道具、风格资产可以跨项目复用。
- [x] 将 `creative_assets`、资产版本、参考图和生成快照分成不同语义层；版本和引用进入生成后不可原地改写。
- [x] 保持用户负责最终视频的合并、取舍、节奏和镜头切换，平台只保证单步素材生成和稳定引用。
- [ ] 将创意资产协议从万能 `@bailian-studio/shared` 提取为独立 contracts/domain 包，并完成唯一事实来源迁移。
- [x] 在资产 API 路由与 repository 之间增加 service/use-case 层，集中处理当前用户资源查找、错误语义和资产操作编排；事务、锁和状态机仍由 repository 保持。
- [x] 实现 Provider-neutral compiler：将已批准资产版本、用户提示词和模型 manifest 编译为稳定的生成参数、媒体引用和不可变快照。
- [x] 将 compiler 接入生成提交 service/repository：API 在估价与正式提交前解析当前用户的已批准资产绑定；generation repository 在最终事务中再次锁定版本、参考图并原子写入 generation record 与创意上下文快照。
- [x] Provider 编译遇到多个同类型媒体槽位时返回结构化歧义错误，禁止自动猜测首帧/尾帧等语义。
- [x] API Client 增加项目、资产、版本、参考图的类型化接口；独立 client 模块已合并进共享 `createApiClient()`，覆盖分页、筛选、项目整理、版本和参考图状态操作。
- [x] Web 增加按项目整理的资产工作台：支持项目整理、资产详情、版本审阅和生成页引用。
- [ ] 为资产工作台补页面级 E2E 与真实浏览器验收；当前单元/API/仓储和生产构建门禁已覆盖。
- [ ] 后续再规划剧本上传/生成与人物、场景、道具提示词分析，不把剧本逻辑塞进资产 repository 或 Provider executor。

当前执行顺序：创意资产 contracts/domain 收口；页面布局继续保持可调整，本阶段不做页面级 UI 测试、不调用真实 Provider/API，也不修改导演、剧本和剪辑流程。

本轮已完成：旧的 `modelId + params + assetRefs` 请求保持兼容；带 `creativeContext` 的新请求由同一个 prepare 结果驱动 `/estimate` 和正式提交，重试路径继续复用 generation repository 已冻结的快照。

API Client 本轮已完成：项目与素材接口使用统一 cookie/fetch 传输层和 zod 响应校验，保留 cursor、筛选、路径编码和服务端错误码；暂不把页面状态或资产工作台交互塞进 client。

资产工作台本轮已完成：草稿版本允许添加/移除参考图并送入确认队列；候选版本可确认或驳回；已确认版本与其参考图保持不可变，只能建立新版本调整。生成页可选择主体、场景、道具和风格的已确认资产，将版本 ID、参考图 ID 与用户提示词编译为 `creativeContext`，同时保留原有媒体参数兼容路径。Docker workspace/runtime 依赖缓存清单已补齐创意资产包。

应用层本轮已完成：创意资产 API 路由通过 `creative-assets/service.ts` 调用 use-case，不再直接编排 repository；资源不存在时统一返回稳定的项目/资产 not-found 错误，状态、权限和持久化边界继续由 service + repository 分层承担。新增的 service 测试只使用 fake repository，不固化页面结构。

## 后续设计议题

- **会话滑动续期**：当前采用 7 天绝对 TTL；滑动续期需要先确定完整的会话策略，再评估引入的认证状态复杂度。
- **错误类型跨层统一继承**：当前各业务层保留独立错误类型，文档已按实际架构修订；统一继承 `BailianStudioError` 作为未来架构演进，不是当前缺陷。
- **扩大 Web 覆盖率范围**：当前 `test:coverage` 门禁覆盖 `apps/web/src/lib/**`；待 stores/hooks 补齐组件级测试后，再扩大覆盖范围。
