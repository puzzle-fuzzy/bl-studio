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
- [x] 将创意资产协议从万能 `@bailian-studio/shared` 提取为独立 `@bailian-studio/creative-asset-contracts` 包，并完成唯一事实来源迁移。
- [x] 修复创意生成上下文复合外键的唯一约束建模，补充 fresh database migration，并完成本地开发库无损 baseline。
- [x] 在资产 API 路由与 repository 之间增加 service/use-case 层，集中处理当前用户资源查找、错误语义和资产操作编排；事务、锁和状态机仍由 repository 保持。
- [x] 实现 Provider-neutral compiler：将已批准资产版本、用户提示词和模型 manifest 编译为稳定的生成参数、媒体引用和不可变快照。
- [x] 将 compiler 接入生成提交 service/repository：API 在估价与正式提交前解析当前用户的已批准资产绑定；generation repository 在最终事务中再次锁定版本、参考图并原子写入 generation record 与创意上下文快照。
- [x] Provider 编译遇到多个同类型媒体槽位时返回结构化歧义错误，禁止自动猜测首帧/尾帧等语义。
- [x] API Client 增加项目、资产、版本、参考图的类型化接口；独立 client 模块已合并进共享 `createApiClient()`，覆盖分页、筛选、项目整理、版本和参考图状态操作。
- [x] Web 增加按项目整理的资产工作台：支持项目整理、资产详情、版本审阅和生成页引用。
- [x] 收紧资产工作台的项目上下文：从项目列表进入项目后直接展示项目素材；“待确认”通过 `versionStatus=candidate` 只筛选当前最新版本，分页不再混入历史候选版本。
- [x] 完成项目详情与批量整理：新增 `/assets/projects/:projectId` 路由、项目详情状态、添加已有资产选择器、多选、全选/半选和批量移出项目；批量移出只解除项目归属，不删除资产。
- [x] 完成项目详情源码级稳定性复核：修复添加已有素材弹窗失败后的重试闭环；页面级浏览器验收仍需有效登录态，暂不伪造测试数据。
- [x] 补齐项目详情的版本状态筛选：通过 URL `status` 参数筛选当前最新版本，支持待确认、已确认、生成中、草稿、已拒绝和已归档。
- [ ] 为资产工作台补页面级 E2E 与真实浏览器验收；当前单元/API/仓储和生产构建门禁已覆盖。
- [ ] 后续再规划剧本上传/生成与人物、场景、道具提示词分析，不把剧本逻辑塞进资产 repository 或 Provider executor。

当前执行顺序：开发环境 migration 基线已收口；项目上下文、最新版本状态筛选和项目详情批量整理已完成。下一步进入页面级浏览器验收与布局调整；本阶段继续不写页面级 UI 测试、不调用真实 Provider/API，也不修改导演、剧本和剪辑流程。

本轮已完成：旧的 `modelId + params + assetRefs` 请求保持兼容；带 `creativeContext` 的新请求由同一个 prepare 结果驱动 `/estimate` 和正式提交，重试路径继续复用 generation repository 已冻结的快照。

API Client 本轮已完成：项目与素材接口使用统一 cookie/fetch 传输层和 zod 响应校验，保留 cursor、筛选、路径编码和服务端错误码；暂不把页面状态或资产工作台交互塞进 client。

本轮状态筛选已完成：资产列表的 `versionStatus` 表示“当前未删除的最新版本状态”，repository 使用最新版本约束参与分页，API Client 与 Web 工作台保持同一语义；前端“待确认”只映射到 `candidate`，不在页面内做假分页筛选。

资产工作台本轮已完成：草稿版本允许添加/移除参考图并送入确认队列；候选版本可确认或驳回；已确认版本与其参考图保持不可变，只能建立新版本调整。生成页可选择主体、场景、道具和风格的已确认资产，将版本 ID、参考图 ID 与用户提示词编译为 `creativeContext`，同时保留原有媒体参数兼容路径。Docker workspace/runtime 依赖缓存清单已补齐创意资产包。

应用层本轮已完成：创意资产 API 路由通过 `creative-assets/service.ts` 调用 use-case，不再直接编排 repository；资源不存在时统一返回稳定的项目/资产 not-found 错误，状态、权限和持久化边界继续由 service + repository 分层承担。新增的 service 测试只使用 fake repository，不固化页面结构。

协议层本轮已完成：创意资产协议迁移到 `@bailian-studio/creative-asset-contracts`，该包只依赖 Zod，作为资产类型、版本/项目状态、参考图 role、生成 binding/context 和归一化规则的唯一事实来源。`shared` 仅通过依赖该包扩展通用生成输入校验；编译器、repository、API Client 和 API 路由均直接依赖协议包，Docker workspace/runtime manifest 也已同步。

开发环境本轮已完成：创意生成上下文的两个复合外键改为明确的唯一约束目标，新增 0056 兼容迁移；已用临时空数据库验证全量 migration 从零执行成功，当前开发库保留原卷并完成 baseline，后续 `db:migrate` 不会重放 0000。

## 后续设计议题

- **会话滑动续期**：当前采用 7 天绝对 TTL；滑动续期需要先确定完整的会话策略，再评估引入的认证状态复杂度。
- **错误类型跨层统一继承**：当前各业务层保留独立错误类型，文档已按实际架构修订；统一继承 `BailianStudioError` 作为未来架构演进，不是当前缺陷。
- **扩大 Web 覆盖率范围**：当前 `test:coverage` 门禁覆盖 `apps/web/src/lib/**`；待 stores/hooks 补齐组件级测试后，再扩大覆盖范围。
