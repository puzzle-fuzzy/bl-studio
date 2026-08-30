/**
 * Node 运行时进程原语。
 *
 * bailian-studio 原实现基于 Bun 运行时，使用了 `Bun.spawn` / `Bun.spawnSync` /
 * `Bun.sleep`。重写为 Node 运行时（bun 安装 + node --import tsx 运行）后，这些 Bun
 * 专属 API 在 Worker/脚本进程中不再可用。
 * 本模块把它们收敛为一份 Node 实现，作为整个迁移的单一接缝：业务代码只依赖
 * 这里导出的形状（Web 可读流 + exited 承诺），不感知底层是 Bun 还是 Node。
 *
 * 入口检测（原 `import.meta.main`）在 Node ≥24.2 已是原生特性，直接使用。
 */

import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process'
import { Readable } from 'node:stream'

/** 一个外部进程句柄，形状对齐 Bun.spawn 返回对象（stderr/stdout 为 Web 可读流）。 */
export interface NodeProcessHandle {
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  kill(): void
}

export interface SpawnProcessOptions {
  stdout?: 'pipe' | 'inherit' | 'ignore'
  stderr?: 'pipe' | 'inherit' | 'ignore'
  cwd?: string
  env?: Record<string, string | undefined>
  /** 独立进程组（POSIX：子进程成为新进程组组长）。开启后 kill() 会向整组发信号。 */
  detached?: boolean
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

function toWebReadable(stream: Readable | null): ReadableStream<Uint8Array> {
  if (stream === null) return emptyStream()
  try {
    return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>
  } catch {
    return emptyStream()
  }
}

/**
 * 以管道或继承方式启动一个进程。`exited` 在子进程关闭时 resolve 退出码；
 * 启动失败（如命令不存在）resolve `-1`，与 spawnSync 语义一致，便于调用方
 * 按退出码统一判断。
 */
export function spawnProcess(command: string[], options: SpawnProcessOptions = {}): NodeProcessHandle {
  const file = command[0]
  const args = command.slice(1)
  if (file === undefined) {
    throw new Error('spawnProcess: command must contain at least one entry')
  }
  // stdio 元素是 'pipe'|'inherit' 联合，TS7 无法匹配具体的 tuple 重载；
  // 用可变数组注解落到通用 StdioOptions 重载。
  const stdio: Array<'ignore' | 'pipe' | 'inherit'> = [
    'ignore',
    options.stdout ?? 'pipe',
    options.stderr ?? 'pipe',
  ]
  const child = nodeSpawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    stdio,
    detached: options.detached ?? false,
  })

  let resolveExit!: (code: number) => void
  const exited = new Promise<number>(resolve => {
    resolveExit = resolve
  })
  child.on('close', code => resolveExit(code ?? -1))
  child.on('error', () => resolveExit(-1))

  return {
    exited,
    stdout: toWebReadable(child.stdout),
    stderr: toWebReadable(child.stderr),
    kill: () => {
      // P1-25：detached 子进程是独立进程组组长，向负 pid 发信号可连所有派生的
      // 子进程一起终止（如 ffmpeg 的子线程/子进程），否则只杀主进程会遗留孤儿。
      // 先 SIGTERM，宽限 2s 仍未退出再 SIGKILL，避免干净进程被立即强杀。
      const pid = child.pid
      if (pid === undefined) return
      const target = options.detached === true ? -pid : pid
      const signal = (sig: NodeJS.Signals) => {
        try {
          process.kill(target, sig)
        } catch {
          // 进程已退出或不存在，忽略。
        }
      }
      signal('SIGTERM')
      const escalateTimer = setTimeout(() => {
        if (child.exitCode === null) signal('SIGKILL')
      }, 2_000)
      escalateTimer.unref()
    },
  }
}

export interface SpawnSyncResult {
  status: number
  stdout: string
  stderr: string
}

/** 同步执行命令并收集输出（用于启动前 git/env 探针等一次性检查）。 */
export function spawnSyncResult(command: string[], options: SpawnProcessOptions = {}): SpawnSyncResult {
  const file = command[0]
  const args = command.slice(1)
  if (file === undefined) {
    throw new Error('spawnSyncResult: command must contain at least one entry')
  }
  const result = nodeSpawnSync(file, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] as Array<'ignore' | 'pipe'>,
  })
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** 休眠 `ms` 毫秒（Bun.sleep 的 Node 等价物）。 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
