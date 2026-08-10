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

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

for (const args of commands[workflow]) {
  const exitCode = await run(pnpmCommand, args)
  if (exitCode !== 0) process.exit(exitCode)
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
