# 导演台合成阶段实施契约

状态：已接入真实执行链路，进入验收与持续优化阶段。

## 当前结论

合成阶段现在创建真实的 `media.process` 任务。媒体管道支持多视频源的
`video.assemble`，Worker 通过 FFmpeg 统一分辨率、帧率、像素格式并可选混入音乐；
完成后同时写入 `user_assets(kind=video)` 与 `director_assets(kind=final_video)`。
合成按钮必须先通过预检和用户确认，避免把不完整的镜头清单送入队列。

## 输入契约

一次合成必须在用户点击执行时生成不可变的 assembly snapshot，至少包含：

- 按 `shot.sequence` 排序的当前有效 `shot_video` 资产 ID；
- 每个片段的导演镜头 ID、版本、目标时长和来源阶段运行 ID；
- 可选的当前有效 `music` 资产 ID、音量和起始偏移；
- 输出容器、视频编码、音频编码、分辨率和帧率策略；
- 项目版本和请求幂等键。

快照只引用 `staleAt IS NULL` 且属于当前用户项目的资产。执行期间修改剧本、镜头或
音乐只会使后续阶段失效，不得改变已经排队的合成输入；旧资产也不能被删除。

## 执行契约

建议将合成纳入现有 `media_jobs`/`media.process` 域，并新增 `video.assemble` 操作：

1. Repository 在事务中校验用户权限、输入资产状态、顺序连续性和幂等键，并保存完整
   `sources` 数组；`source_asset_id` 只作为兼容性的主源索引，不能代表全部输入。
2. Worker 有界地读取所有视频和可选音频，先做容器/轨道兼容性检查，再调用新的
   `MediaProcessor.assembleVideo`。FFmpeg 参数只能由结构化输入生成，不能拼接用户原始
   shell 字符串。
3. 视频统一到受控的分辨率、像素格式和帧率后 concat；音乐使用明确的 `volume`，
  通过 loop 输入和 `-shortest` 控制尾部，不对用户输入拼接 shell 字符串。
4. 输出写入应用存储，使用稳定的 `asset_{mediaJobId}_video` ID；完成事务同时创建
   `user_assets(kind=video, source=derived)` 和 `director_assets(kind=final_video)`。
5. 同一个任务重试必须复用同一输出 ID；已成功任务只允许幂等返回，不能重复扣费或
   创建第二个最终资产。失败时清理临时对象，保留结构化错误和 traceId。

## API 与 UI 边界

- API 需要提供合成前预检/费用（如有）接口，返回缺失镜头、过时资产、媒体不兼容和
  预计输出时长；预检失败时不得创建 phase run。
- 用户确认后才创建 `assemble` phase run。UI 展示固定的镜头顺序、音乐选择、输出设置、
  预检结果和执行进度；不要让用户误以为“阶段已纳入流程”就等同于“已经可以执行”。
- 合成完成后只将新的 `final_video` 设为当前资产，历史成片保留并标记过时；任何输入
  变化都应使 `assemble` 回到可重新预检状态。

## 实施顺序

1. ✅ 扩展媒体任务类型和 Repository 的多源输入/幂等模型，并补充仓储集成测试。
2. ✅ 扩展 FFmpeg Processor 与有界输入读取，覆盖 codec、超时、输出大小和临时文件清理边界。
3. ✅ 增加导演合成 preflight、phase worker 和 `final_video` 回写。
4. ✅ 接入 UI 确认、顺序预览、失败恢复和旧版本标记；下一步是线上媒体样本验收和播放器预览。

输入变化会让新的合成回到预检状态，但不会删除已经生成的镜头、音乐或历史成片。
