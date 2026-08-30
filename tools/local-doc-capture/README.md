# 百炼公开文档本地采集工具

这是开发者本地辅助工具，不是正式产品功能。它只把用户明确点击扩展按钮后看到的
百炼公开文档正文交给本机 `127.0.0.1:43127` 处理，输出到被 git 忽略的
`data/captures`。

请打开两个 PowerShell 窗口：

```powershell
# 窗口一：启动 loopback 服务
bun run tools/local-doc-capture/src/server.ts

# 窗口二：读取窗口一生成的令牌并构建扩展
bun run docs:bailian:sync
bun run tools/local-doc-capture/extension/scripts/build.ts
```

再在 Chrome/Edge 开发者模式加载 `extension/dist`。只打开
`https://help.aliyun.com` 的公开文档，若遇到挑战页先按正常流程处理；等真实文档内容
显示后，再点击“开始批量采集”。构建时会读取最新官方导航同步产生的登记表，按登记表
中的 URL 队列覆盖模型 API 文档分支；通过本地过滤规则的页面才会提交到本地服务。
Token Plan、Coding Plan、资源包、额度、计费、价格和账单类页面会直接跳过。达到有效
页数上限、队列处理完成或遇到挑战页时停止或暂停。

正式构建不包含 `tools`，正式 API 没有对应路由、数据库表或用户页面接收能力。

后续每次同步的职责、差异核对范围、Manifest 更新边界和验收清单见
[`docs/bailian/official/README.md`](../../docs/bailian/official/README.md)。本工具只负责在本机
保存用户主动采集的官方页面证据；采集完成后由助手审阅差异并更新正式模型代码，不会自动合并。

## 中断恢复与本地同步进度

扩展的批量导航状态保存在 Chrome 的 `chrome.storage.local`；模型文档处理账本保存在
`data/model-sync-state.json`，该文件被 git 忽略，只在本机使用。采集完成或中断后执行：

```powershell
bun run scripts/docs/model-sync-state.ts --init
bun run scripts/docs/model-sync-state.ts --status
bun run scripts/docs/model-sync-state.ts --next
```

账本会记录当前快照/文档哈希、每篇文档状态、对应模型和 Manifest 变更、测试结果及
提交 SHA。重新初始化时，未变化的文档保留进度，变化或未完成的文档才会进入 `--next`；
已有 `data/captures` 结果会直接按 URL 和内容哈希复用。扩展自身中断后，若状态为暂停，
在弹窗点击“继续批量采集”；账本不会代替扩展的页面导航状态。
