import { spawn } from 'node:child_process'

const deployHost = process.env['DEPLOY_HOST']?.trim()
if (!deployHost) {
  console.error('缺少 DEPLOY_HOST，请先配置 infra/env/.env.prod-infra')
  process.exit(2)
}

const sshCommand = process.platform === 'win32' ? 'ssh.exe' : 'ssh'
const child = spawn(
  sshCommand,
  ['-o', 'ConnectTimeout=10', deployHost, 'free -h && docker stats --no-stream'],
  { env: process.env, shell: false, stdio: 'inherit', windowsHide: true },
)

child.once('error', error => {
  console.error(`无法启动 ssh：${error.message}`)
  process.exit(1)
})

child.once('exit', (code, signal) => {
  if (signal !== null) process.exit(1)
  process.exit(code ?? 1)
})
