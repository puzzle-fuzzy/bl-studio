# @bailian-studio/task-repository

`task_records` 的持久化接缝。这个包只拥有任务队列的生命周期操作：

- `claimNextQueuedTask`：使用 `FOR UPDATE SKIP LOCKED` 原子认领 queued 或过期 running 任务；
- `renewTaskLock`：只允许当前 worker 在租约仍有效时续租；
- `saveTask`：保存状态机结果，并在传入 owner 时阻止旧 worker 覆盖新 worker；
- `getTask`：按 id 读取任务。
- `enqueueTask`：在调用方已开启的业务事务中写入初始/后续任务，并返回映射后的领域记录。

状态转换仍由无数据库依赖的 `@bailian-studio/task-engine` 负责，日期/JSON 转换和 Drizzle 查询留在本包。`enqueueTask` 接收业务 repository 已开启的事务句柄，因此仍保持“业务记录 + 初始任务”单事务；事务的开启与业务记录写入责任不被任务包夺走。

`@bailian-studio/generation-repository` 不再承载任务生命周期 facade；Worker 已通过
`persistence-runtime` 注入本包，从而不再把完整 GenerationRepository 当作队列依赖。
generation、media、director 的业务 repository 由组合根注入同一个
`TaskQueueTransactionStore`，把“业务记录 + 初始任务”保持在调用方开启的同一事务中。
