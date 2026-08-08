# 公网安全、内容举报与法律页面计划

> 用户已授权处理“公网限流/举报审核/隐私协议/服务条款”；运营主体、联系邮箱和最终法律文本不由代码推断。

## 目标

把现有“内部同事工具”的社区假设收紧为可控的登录后社区能力：所有社区写操作进入限流；用户可对公开作品提交一次举报；管理员有独立举报队列并能变更审核状态或联动下架；登录/注册入口提供隐私政策与服务条款链接。

## 架构边界

- 举报使用独立 `content_reports` 表，不复用 `user_feedback`，避免把产品建议和合规/安全事件混为一类。
- 当前只支持 `generation` 目标，且服务端再次确认目标是公开、成功、未删除、未下架作品；私有作品统一按不存在返回，避免 ID 枚举。
- “审核”是人工队列与下架操作，不虚构 AI 自动审核、版权判断或法律结论。
- 每个用户对同一作品只允许一条未删除举报；重复提交返回稳定 409。
- 法律页面文案明确数据处理、第三方 DashScope/OSS、公开分享、删除请求和人工审核边界；主体、邮箱、生效日期由 `VITE_LEGAL_*` 注入。
- `PUBLIC_WEB_LAUNCH=true` 时生产预检强制要求法律主体、联系邮箱和生效日期；默认内部部署可以先使用草案页面，但不能被误称为正式公网合规材料。

## 实施步骤

1. 在 `packages/db/src/schema.ts` 增加 `contentReports`、检查约束、索引和审计动作；用 Drizzle 生成迁移并更新公共导出。
2. 在 `packages/generation-repository/src/content.ts`、`types.ts`、`errors.ts` 增加举报提交、管理员分页列表、状态更新和重复/不可见目标错误；保留目标作品下架由已有 gallery governance 接口负责。
3. 新增 `apps/api/src/modules/reports/routes.ts`，挂载用户提交、管理员列表和状态更新路由；将 `/api/reports` 纳入社区限流桶；审计成功/失败结果。
4. 在 `packages/api-client` 增加举报 wire schema、方法和类型；在 web 画廊详情添加举报表单；在 admin 增加举报列表、状态流转和一键下架入口。
5. 新增 `/privacy` 与 `/terms` 公开页面，给 `LoginPage`/`AuthDialog` 加链接，并把法律注入参数接入 Docker web build 和生产预检。
6. 更新 README/运维与社区文档，明确当前仍未实现支付、团队协作、自动审核和正式法律审查。

## 验证

- API 测试：未登录、非公开目标、重复举报、管理员权限、状态更新和联动隐藏。
- repository/迁移/审计一致性检查；api-client schema 解析测试。
- web/admin typecheck/build；法律路由可直接渲染。
- `pnpm run verify`、`pnpm run build`；不运行真实 provider 生成。

## 发布前人工输入

- `VITE_LEGAL_ENTITY`：真实运营主体；
- `VITE_LEGAL_CONTACT_EMAIL`：处理隐私/举报请求的真实联系邮箱；
- `VITE_LEGAL_EFFECTIVE_DATE`：经确认的生效日期；
- 由运营方/律师最终审阅法律文本；代码中的页面只是产品事实草案。
