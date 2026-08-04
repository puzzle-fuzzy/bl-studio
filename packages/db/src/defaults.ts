/**
 * 本地 dev / test 数据库默认连接串的单一来源（canonical source）。
 *
 * 为什么仍要在 package.json 的 `db:*` 脚本里保留字面量：那些脚本通过
 * `DATABASE_URL=... bun x drizzle-kit ...` 内联传值——因为 `bun --env-file x drizzle-kit`
 * 不会把 env-file 变量透传给 drizzle-kit 子进程（见 CLAUDE.md），内联是唯一可靠方式。
 *
 * 因此这里的常量服务的是【代码侧】（drizzle.config.ts、以及任何需要默认串的 TS 代码），
 * 避免字面量再散落到代码里。**修改默认连接串时，务必同步：**
 *   - package.json 的 `db:push` / `db:studio` / `db:push:test` / `db:studio:test`
 *   - infra/env/.env.example / infra/env/.env.test.example
 */
export const DEV_DATABASE_URL = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55431/bailian-studio_dev'
export const TEST_DATABASE_URL = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
