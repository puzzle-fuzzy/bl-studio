# @bailian-studio/task-repository

`task_records` 的持久化接缝。这个包拥有任务队列的生命周期操作，以及业务事务内的窄查询：

- `claimNextQueuedTask`：使用 `FOR UPDATE SKIP LOCKED` 原子认领 queued 或过期 running 任务；
- `renewTaskLock`：只允许当前 worker 在租约仍有效时续租；
- `saveTask`：保存状态机结果，并在传入 owner 时阻止旧 worker 覆盖新 worker；
- `getTask`：按 id 读取任务；
- `findTask`：按关联记录、类型和状态筛选一条任务；调用方可传入正在执行的业务事务以保持读取一致性。
- `cancelQueuedTasks`：在调用方事务内按 task-engine 取消仍处于 queued 的匹配任务。
- `enqueueTask`：在调用方已开启的业务事务中写入初始/后续任务，并返回映射后的领域记录。

状态转换仍由无数据库依赖的 `@bailian-studio/task-engine` 负责，日期/JSON 转换和 Drizzle 查询留在本包。`enqueueTask` 接收业务 repository 已开启的事务句柄，因此仍保持“业务记录 + 初始任务”单事务；事务的开启与业务记录写入责任不被任务包夺走。

`@bailian-studio/generation-repository` 不再承载任务生命周期 facade；Worker 已通过
`persistence-runtime` 注入本包，从而不再把完整 GenerationRepository 当作队列依赖。
generation、media、director 的业务 repository 由组合根注入同一个
`TaskQueueTransactionStore`，把“业务记录 + 初始任务”保持在调用方开启的同一事务中；
任务查询也通过该 store 复用同一事务，业务 repository 不再直接 import `task_records` 做简单查询。
