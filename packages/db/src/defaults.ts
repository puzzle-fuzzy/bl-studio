/**
 * 本地 dev / test 数据库默认连接串的单一来源（canonical source）。
 *
 * package.json 的 db:* 脚本通过 dotenv-cli 把 env 文件传给 drizzle-kit 和 TS 脚本，
 * 因此不再把连接串暴露在命令行中。这里的常量服务的是代码侧（drizzle.config.ts、
 * 以及任何需要默认串的 TS 代码）。**修改默认连接串时，务必同步：**
 *   - .env.example / .env.test.example
 */
export const DEV_DATABASE_URL = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55431/bailian-studio_dev'
export const TEST_DATABASE_URL = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
