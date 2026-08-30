import { spawn } from 'node:child_process'

type Workflow = 'test' | 'coverage' | 'verify'

const workflow = process.argv[2] as Workflow | undefined

const commands: Record<Workflow, string[][]> = {
  test: [
    ['run', 'test:root'],
    ['x', 'turbo', 'run', 'test', '--concurrency=1'],
  ],
  coverage: [
    ['x', 'turbo', 'run', 'test:coverage', '--concurrency=1'],
  ],
  verify: [
    ['run', 'check:db-migrations'],
    ['run', 'check:boundaries'],
    ['run', 'check:workspace-deps'],
    ['run', 'check:local-capture-boundary'],
    ['run', 'check:manifests'],
    ['run', 'docs:bailian:snapshot:check'],
    ['run', 'lint'],
    ['run', 'typecheck:root'],
    ['run', 'typecheck'],
    // build 门禁：typecheck 捕捉不到 Vite 打包期失败（bundler 解析、CSS 管线、
    // 循环导入的运行时断裂），没有这一步红线会推迟到部署机上才首次暴露。
    ['run', 'build'],
    ['run', 'test'],
    ['run', 'test:coverage'],
  ],
}

if (workflow === undefined || !(workflow in commands)) {
  console.error('Usage: tsx scripts/verify/run-workflow.ts <test|coverage|verify>')
  process.exit(2)
}

// bun 在所有平台上都是单一可执行文件（Windows 也是 bun.exe，非 .cmd shim），
// 可以直接 shell:false spawn；workflow 参数是固定 token，不含用户输入。
const packageManagerCommand = 'bun'

try {
  for (const args of commands[workflow]) {
    const exitCode = await run(packageManagerCommand, args)
    if (exitCode !== 0) process.exit(exitCode)
  }
}
catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Failed to start ${packageManagerCommand}: ${message}`)
  process.exit(1)
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
