/**
 * Node 运行时进程原语。
 *
 * bailian-studio 原实现基于 Bun 运行时，使用了 `Bun.spawn` / `Bun.spawnSync` /
 * `Bun.sleep`。重写为 Node 运行时（pnpm + tsx）后，这些 Bun 专属 API 不再可用。
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
      child.kill()
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
