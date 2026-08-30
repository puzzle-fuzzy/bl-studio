# Bailian Studio 本地文档采集扩展

这是开发者本地使用的 Chrome/Edge Manifest V3 扩展，不属于正式发布包。

## 行为边界

- 只允许精确来源 `https://help.aliyun.com`。
- 只有用户打开扩展 Popup 并点击“采集当前页面”时才读取页面。
- 只声明精确的百炼帮助站点和本地服务权限，不注册全局访问监听器。
- 只提取正文纯文本，删除脚本、样式、表单、按钮、iframe、SVG 和隐藏内容。
- 服务只监听 `http://127.0.0.1:43127`，扩展使用本地令牌，不使用正式 API 或登录会话。
- 本地服务会再次校验来源白名单、内容大小和正文哈希。
- 批量模式使用构建时读取的官方文档登记表 URL 队列，覆盖侧边栏分支，并记录已访问 URL
  防止循环。
- 批量模式会在本地读取页面标题和 URL 后先执行过滤；Token Plan、Coding Plan、资源包、
  额度、计费、价格和账单类页面不会上传，也不计入有效采集页数。模型限流和 Token 鉴权
  不在默认跳过规则中。

## 构建

```powershell
bun run tools/local-doc-capture/src/server.ts
bun run docs:bailian:sync
bun run tools/local-doc-capture/extension/scripts/build.ts
```

然后在 Chrome/Edge 的扩展管理页面开启开发者模式，加载未打包的
`tools/local-doc-capture/extension/dist`。打开文档后，可以点击“采集当前页面”，也可以
点击“开始批量采集”。状态中的“队列”是官方登记表处理进度，“已保存”是有效采集页数，
“已跳过”是本地过滤掉的页面数。每次官方文档发生变化后，重新运行同步和构建即可更新
队列；不会把文档版本写入正式模型数据。

采集结果只写入 `tools/local-doc-capture/data/captures`，不会进入数据库、正式 API 或
模型运行时清单。

当前版本不绕过挑战页。用户正常打开并通过挑战后，等真实文档内容显示，再手动点击采集。
