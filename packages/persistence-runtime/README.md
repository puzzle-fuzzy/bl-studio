# @bailian-studio/persistence-runtime

API 与 Worker 的进程级持久化组合根。

- 每个进程只创建一个共享的 PostgreSQL/Drizzle 句柄。
- 将同一句柄注入各 repository、认证服务和积分账本。
- Worker 运行时额外创建审计 outbox repository，由 WorkerLoop 负责后台消费；API 不启动该消费者。
- 由组合根统一关闭连接池；repository/service 不拥有连接生命周期。
- 不启动 HTTP、Worker、Provider 或 `LISTEN/NOTIFY` listener。

`create…FromUrl` 仍适合独立包测试和单模块工具；API/Worker 入口应使用本包的
`createApiPersistenceRuntime` 或 `createWorkerPersistenceRuntime`。
