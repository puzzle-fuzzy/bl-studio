/**
 * task 状态机的纯函数实现。
 *
 * 本模块不依赖 DB、不依赖 Elysia/React，是 @bailian-studio/task-engine 的核心：
 * transitionTask 接受一条 task 记录与一次转换动作，校验合法性后返回新的
 * task 记录（不修改入参）。持久化由 @bailian-studio/generation-repository 负责，
 * 调度（claim/succeed/retry/fail/cancel 的实际触发）由 worker 负责。
 */

import type { TaskRecord, TaskTransition } from './types'

/**
 * 推动一个 task 走一次状态转换，返回转换后的新 task 记录（不修改入参）。
 *
 * 合法状态图（节点为 status，边标注转换动作）：
 *
 *     queued ──claim──▶ running ──succeed──▶ succeeded   (终态)
 *                         │
 *                         ├──fail────▶ failed            (终态)
 *                         │
 *                         ├──retry*──▶ queued  (回到队列，等待下次 claim)
 *                         │
 *                         └──cancel──▶ cancelled         (终态)
 *     queued ──cancel──▶ cancelled
 *
 * 关键不变量（每个 case 都有对应护栏）：
 *  - 入口先经 assertTaskTypeMatchesDomain，确保 type↔domain 配对正确
 *    （如 'generation.submit' 必须搭配 'generation'），防止脏数据按错误的
 *    domain 路由、跨业务域串味；
 *  - succeed / fail / retry 只能在 running 下触发（assertRunning）；
 *  - retry 仅当"error.retriable 为真 且 attempts < maxAttempts"时回到 queued，
 *    否则直接降级为 failed——即超过重试上限或不可重试错误一律视作最终失败；
 *  - claim 是 queued→running 的唯一入口，但额外允许在 running 且锁已过期时
 *    重新 claim（处理 worker 崩溃后的"僵尸 task"，attempts 不递增）；
 *  - cancel 仅在 queued / running 下允许（assertCancellable）；
 *  - 所有终态写入以及 retry 排回都会经 clearLock 抹掉 lockedBy / lockedUntil，
 *    保证持久化记录干净、不带已失效的锁信息。
 *
 * @param task       当前 task 记录（视为不可变，函数返回新对象）
 * @param transition 本次转换动作（claim / succeed / retry / fail / cancel 之一）
 * @returns 转换后的新 task 记录
 * @throws 当 type↔domain 配对错误、状态不在合法转换路径上、或 claim 时机不当时抛错
 */
export function transitionTask(task: TaskRecord, transition: TaskTransition): TaskRecord {
  assertTaskTypeMatchesDomain(task)

  switch (transition.type) {
    case 'claim':
      return claimTask(task, transition)
    case 'succeed':
      assertRunning(task, transition.type)
      return clearLock({
        ...task,
        status: 'succeeded',
        output: transition.output,
        completedAt: transition.now,
        updatedAt: transition.now,
      })
    case 'retry':
      assertRunning(task, transition.type)
      // 仅当"错误可重试"且"重试次数未用尽"时回到队列等待下次执行；
      // 否则降级为最终失败（避免无限重试把任务永久卡在队列里）。
      if (transition.error.retriable && task.attempts < task.maxAttempts) {
        return clearLock({
          ...task,
          status: 'queued',
          nextRunAt: transition.nextRunAt,
          errorJson: transition.error,
          completedAt: undefined,
          updatedAt: transition.now,
        })
      }

      return clearLock({
        ...task,
        status: 'failed',
        errorJson: transition.error,
        completedAt: transition.now,
        updatedAt: transition.now,
      })
    case 'fail':
      assertRunning(task, transition.type)
      return clearLock({
        ...task,
        status: 'failed',
        errorJson: transition.error,
        completedAt: transition.now,
        updatedAt: transition.now,
      })
    case 'cancel':
      assertCancellable(task)
      return clearLock({
        ...task,
        status: 'cancelled',
        errorJson: transition.error,
        completedAt: transition.now,
        updatedAt: transition.now,
      })
  }
}

/**
 * 校验 task.type 与 task.domain 的固定配对关系。
 *
 * 这是状态机的第一道护栏：每种 type 只能属于一个 domain——
 * 'generation.submit' / 'generation.poll' 必须搭配 'generation'，
 * 'artifact.persist' 必须搭配 'artifact'。一旦上游持久化层写入了配对错误
 * 的脏数据，这里直接抛错，避免后续按错误的 domain 路由或归档。
 */
function assertTaskTypeMatchesDomain(task: TaskRecord): void {
  const expectedDomainByType: Record<TaskRecord['type'], TaskRecord['domain']> = {
    'artifact.persist': 'artifact',
    'director.phase': 'director',
    'generation.poll': 'generation',
    'generation.submit': 'generation',
    'media.process': 'media',
    'media.thumbnail': 'media',
  }

  const expectedDomain = expectedDomainByType[task.type]
  if (task.domain !== expectedDomain) {
    throw new Error(`task type ${task.type} must use domain ${expectedDomain}`)
  }
}

/**
 * 处理 claim 动作：queued → running 的正常入口，以及 running 下锁过期后的
 * "重新认领"。
 *
 * 两条路径：
 *  1) task 已是 running：只有当 lockedUntil 已过（说明上次认领的 worker 失联）
 *     才允许被另一个 worker 重新 claim；此时 attempts 不递增，因为上一次
 *     attempt 的结果尚未判定（worker 可能崩溃在半途），不应计入重试预算；
 *  2) task 处于 queued：要求 nextRunAt 已到达（未到说明在 retry 退避窗口内，
 *     不该被捞出来消费），正常推进为 running，attempts+1。
 */
function claimTask(
  task: TaskRecord,
  transition: Extract<TaskTransition, { type: 'claim' }>,
): TaskRecord {
  if (task.status === 'running') {
    if (!task.lockedUntil || Date.parse(task.lockedUntil) > Date.parse(transition.now)) {
      throw new Error(`cannot claim task with status running: lock has not expired`)
    }
    // 僵尸 task 复活：上次认领的 worker 失联（锁已过期），交给新 worker 接手，
    // 不递增 attempts，避免一次 worker 崩溃就白白吃掉一次重试预算。
    return {
      ...task,
      lockedBy: transition.workerId,
      lockedUntil: transition.lockedUntil,
      startedAt: transition.now,
      completedAt: undefined,
      updatedAt: transition.now,
    }
  }

  if (task.status !== 'queued') {
    throw new Error(`cannot claim task with status ${task.status}`)
  }

  // 退避窗口未到：nextRunAt 在未来，说明这是 retry 后排回的 task，还不能消费。
  if (Date.parse(task.nextRunAt) > Date.parse(transition.now)) {
    throw new Error('task is not ready')
  }

  return {
    ...task,
    status: 'running',
    lockedBy: transition.workerId,
    lockedUntil: transition.lockedUntil,
    startedAt: transition.now,
    completedAt: undefined,
    attempts: task.attempts + 1,
    updatedAt: transition.now,
  }
}

/** 校验 task 必须处于 running 才能进行 succeed / retry / fail 等终态转换。 */
function assertRunning(task: TaskRecord, transitionType: string): void {
  if (task.status !== 'running') {
    throw new Error(`cannot ${transitionType} task with status ${task.status}`)
  }
}

/** 校验 task 处于 queued 或 running 才能被 cancel（终态记录不可取消）。 */
function assertCancellable(task: TaskRecord): void {
  if (task.status !== 'queued' && task.status !== 'running') {
    throw new Error(`cannot cancel task with status ${task.status}`)
  }
}

/**
 * 抹掉 task 上的锁字段（lockedBy / lockedUntil）。
 *
 * 一旦 task 进入任意终态（succeeded / failed / cancelled）或被 retry 排回
 * queued，旧的锁信息就失去意义；统一在这里摘除，保证持久化层读到的记录
 * 干净、不带已被释放的锁残留。
 */
function clearLock(task: TaskRecord): TaskRecord {
  const { lockedBy: _lockedBy, lockedUntil: _lockedUntil, ...unlockedTask } = task
  return unlockedTask
}
