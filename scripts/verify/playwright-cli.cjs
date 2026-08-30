// 各包管理器在 Windows 上生成的 .bin shim 可能让 Playwright CLI 通过错误的解析
// 入口加载。先解析真实包入口，再由 Node 运行 Playwright 官方 CLI。
const cliPath = require.resolve('@playwright/test/cli')
require(cliPath)
