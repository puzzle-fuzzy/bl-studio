import { spawn } from 'node:child_process'

type Workflow = 'test' | 'coverage' | 'verify'

const workflow = process.argv[2] as Workflow | undefined

const commands: Record<Workflow, string[][]> = {
  test: [
    ['run', 'test:root'],
    ['exec', 'turbo', 'run', 'test', '--concurrency=1'],
  ],
  coverage: [
    ['exec', 'turbo', 'run', 'test:coverage', '--concurrency=1'],
  ],
  verify: [
    ['run', 'check:db-migrations'],
    ['run', 'check:boundaries'],
    ['run', 'check:manifests'],
    ['run', 'lint'],
    ['run', 'typecheck:root'],
    ['run', 'typecheck'],
    ['run', 'test'],
    ['run', 'test:coverage'],
  ],
}

if (workflow === undefined || !(workflow in commands)) {
  console.error('Usage: tsx infra/scripts/run-workflow.ts <test|coverage|verify>')
  process.exit(2)
}

// Windows package managers commonly expose pnpm through a `.cmd` shim. Invoke
// it through cmd.exe explicitly so the child process can remain shell:false;
// the workflow arguments below are fixed tokens, not user input.
const isWindows = process.platform === 'win32'
const pnpmCommand = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'

try {
  for (const args of commands[workflow]) {
    const exitCode = await run(pnpmCommand, args)
    if (exitCode !== 0) process.exit(exitCode)
  }
}
catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Failed to start ${pnpmCommand}: ${message}`)
  process.exit(1)
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const spawnArgs = isWindows
      ? ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]
      : args
    const child = spawn(command, spawnArgs, {
      env: process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal !== null) {
        resolve(1)
        return
      }
      resolve(code ?? 1)
    })
  })
}
