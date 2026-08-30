/**
 * 兼容出口：schema 定义已按业务域拆分到 ./schema/（identity / ops / generation /
 * credits / creative / community / director），统一经 ./schema/index.ts 出口。
 * 保留本文件是为了不改 drizzle.config.ts 与既有 `./schema` 相对导入路径。
 */
export * from './schema/index'
