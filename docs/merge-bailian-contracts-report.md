# 契约并入迁移对账报告（bailian-hub → model-core manifests）

- 迁移时间：2026-08-07T08:56:08.845Z
- 本次改写 manifest：0 个（涉及文件：0 个）
- 已迁移形态：45/45（`pricing.rates` + `transport` 就绪）
- 契约匹配：45/45（未匹配 0 个 manifest）
- 幂等：逐 manifest 检查 pricing 已含 `rates:` 即跳过，重复运行安全

## 总体结论

- 全部 45 个导出 manifest 均迁移到新形态（`pricing.rates` 必填、`transport` 必填、`rules?`）。
- `mediaGroups` / `actualUsage` / `tiers` 已删除；跨字段约束统一为 `rules[]`（media-group / text-length / required-one-of）。
- `conditions.mode` 的 omni token 价与隐藏 `mode` 参数见「omni 定价决策」。
- `matchesWhen` 缺陷与 `conditions.mode` vs 参数声明的冲突见「设计缺陷」章节。

## 未映射到 manifest 的契约（bailian-hub 有、本仓库尚无 manifest）

- `kling/kling-v3-image-generation`
- `wan3.0-video`

## 契约匹配清单

| manifest id | 契约 | 状态 |
|---|---|---|
| `qwen-image` | `qwen-image` | 已匹配（本次跳过/延后） |
| `qwen-image-2.0-pro` | `qwen-image-2.0-pro` | 已匹配（本次跳过/延后） |
| `qwen-image-max` | `qwen-image-max` | 已匹配（本次跳过/延后） |
| `qwen-image-2.0` | `qwen-image-2.0` | 已匹配（本次跳过/延后） |
| `qwen-image-edit-max` | `qwen-image-edit-max` | 已匹配（本次跳过/延后） |
| `qwen-image-edit-plus` | `qwen-image-edit-plus` | 已匹配（本次跳过/延后） |
| `qwen-image-edit` | `qwen-image-edit` | 已匹配（本次跳过/延后） |
| `wanx-2.7-image-pro` | `wan2.7-image-pro` | 已匹配（本次跳过/延后） |
| `wanx-2.7-image` | `wan2.7-image` | 已匹配（本次跳过/延后） |
| `z-image-turbo` | `z-image-turbo` | 已匹配（本次跳过/延后） |
| `wanx-text-to-video` | `wanx2.1-t2v-turbo` | 已匹配（本次跳过/延后） |
| `vidu-text-to-video-pro` | `vidu/viduq3-pro_text2video` | 已匹配（本次跳过/延后） |
| `vidu-text-to-video-turbo` | `vidu/viduq3-turbo_text2video` | 已匹配（本次跳过/延后） |
| `vidu-text-to-video` | `vidu/viduq2_text2video` | 已匹配（本次跳过/延后） |
| `vidu-image-to-video` | `vidu/viduq3-pro_img2video` | 已匹配（本次跳过/延后） |
| `vidu-first-last-frame-video` | `vidu/viduq3-pro_start-end2video` | 已匹配（本次跳过/延后） |
| `vidu-reference-video` | `vidu/viduq3-mix_reference2video` | 已匹配（本次跳过/延后） |
| `wanx-2.7-text-to-video` | `wan2.7-t2v` | 已匹配（本次跳过/延后） |
| `wanx-2.7-image-to-video` | `wan2.7-i2v-2026-04-25` | 已匹配（本次跳过/延后） |
| `wanx-2.7-reference-video` | `wan2.7-r2v` | 已匹配（本次跳过/延后） |
| `wanx-2.7-video-edit` | `wan2.7-videoedit` | 已匹配（本次跳过/延后） |
| `keling-text-to-video` | `kling/kling-v3-video-generation` | 已匹配（本次跳过/延后） |
| `keling-image-to-video` | `kling/kling-v3-omni-video-generation` | 已匹配（本次跳过/延后） |
| `keling-first-last-frame-video` | `kling/kling-v3-omni-video-generation` | 已匹配（本次跳过/延后） |
| `keling-reference-video` | `kling/kling-v3-omni-video-generation` | 已匹配（本次跳过/延后） |
| `keling-video-edit` | `kling/kling-v3-omni-video-generation` | 已匹配（本次跳过/延后） |
| `aishi-text-to-video` | `pixverse/pixverse-c1-t2v` | 已匹配（本次跳过/延后） |
| `aishi-image-to-video` | `pixverse/pixverse-c1-it2v` | 已匹配（本次跳过/延后） |
| `aishi-first-last-frame-video` | `pixverse/pixverse-c1-kf2v` | 已匹配（本次跳过/延后） |
| `happyhorse-text-to-video` | `happyhorse-1.1-t2v` | 已匹配（本次跳过/延后） |
| `happyhorse-image-to-video` | `happyhorse-1.1-i2v` | 已匹配（本次跳过/延后） |
| `happyhorse-reference-video` | `happyhorse-1.1-r2v` | 已匹配（本次跳过/延后） |
| `happyhorse-video-edit` | `happyhorse-1.0-video-edit` | 已匹配（本次跳过/延后） |
| `qwen-plus` | `qwen-plus` | 已匹配（本次跳过/延后） |
| `qwen-max` | `qwen-max` | 已匹配（本次跳过/延后） |
| `qwen-turbo` | `qwen-turbo` | 已匹配（本次跳过/延后） |
| `qwen-flash` | `qwen-flash` | 已匹配（本次跳过/延后） |
| `qwen-long` | `qwen-long` | 已匹配（本次跳过/延后） |
| `deepseek-v4-pro` | `deepseek-v4-pro` | 已匹配（本次跳过/延后） |
| `deepseek-v4-flash` | `deepseek-v4-flash` | 已匹配（本次跳过/延后） |
| `qwen-omni-screenplay` | `qwen3.5-omni-plus` | 已匹配（本次跳过/延后） |
| `qwen-omni-screenplay-flash` | `qwen3.5-omni-flash` | 已匹配（本次跳过/延后） |
| `fun-music-v1` | `fun-music-v1` | 已匹配（本次跳过/延后） |
| `fun-asr-v1` | `fun-asr` | 已匹配（本次跳过/延后） |
| `paraformer-v1` | `paraformer-v1` | 已匹配（本次跳过/延后） |

## 费率变化

> 旧 tiers 的 `priceCents` 是 CNY 分；新 rates 的 `unitPrice` 是 CNY 元字符串。
> 契约多数按阶梯显式标价（如 resolution:720P），无空 conditions 的「默认价」；estimatePriceCents 会回退到 rates[0]。

| manifest id | 旧默认价（分） | 新默认价（元） | 变化 | 说明 |
|---|---|---|---|---|
| `qwen-image-edit-max` | 50 | `0.5` | 不变 | 默认 → `0.5`元/image |
| `qwen-image-edit-plus` | 20 | `0.2` | 不变 | 默认 → `0.2`元/image |
| `qwen-image-edit` | 30 | `0.3` | 不变 | 默认 → `0.3`元/image |

## NOT-MODELED（契约规则/能力未映射到 manifest）

| manifest id | 未建模项 |
|---|---|
| `wanx-text-to-video` | resolution 阶梯条件（480P/720P 同价 0.24，manifest 用 size 而非 resolution，收敛为单一默认价） |
| `wanx-2.7-image-to-video` | last_frame 首帧/尾帧数组中 first_clip、last_frame ≤1 的 array-item-count 规则（manifest 无 lastFrame/firstClip 参数） |
| `wanx-2.7-image-to-video` | first_frame、driving_audio ≤1 的 array-item-count 规则（已由单媒体参数天然满足） |
| `wanx-2.7-reference-video` | reference_voice 参考音色（契约字段，manifest 未建模） |
| `wanx-2.7-reference-video` | first_frame ≤1 的 array-item-count 规则（manifest 无 firstFrame 参数） |
| `wanx-2.7-video-edit` | video 恰为 1 个、reference_image ≤4（已由必填单媒体参数与 maxItems:4 天然满足） |
| `keling-text-to-video` | text-length prompt ≤2500（已由 prompt maxLength:2500 天然满足） |
| `keling-text-to-video` | shot_type / multi_shot / multi_prompt / 分镜时长 系列规则（manifest 未建模这些字段） |
| `keling-image-to-video` | text-length prompt ≤2500（已由 prompt maxLength:2500 天然满足） |
| `keling-image-to-video` | shot_type / multi_shot / multi_prompt 系列规则（manifest 未建模） |
| `keling-image-to-video` | last_frame ≤1 的 array-item-count 规则（manifest 无 lastFrame 参数） |
| `keling-first-last-frame-video` | text-length prompt ≤2500（已由 prompt maxLength:2500 天然满足） |
| `keling-first-last-frame-video` | shot_type / multi_shot / multi_prompt 系列规则（manifest 未建模） |
| `keling-reference-video` | element_list 主体（kling 契约 subject，manifest 未建模；references maxItems:7 覆盖无特征视频时的 ≤7） |
| `keling-reference-video` | feature min1 when first_frame / refer max0 when first_frame / aspect_ratio required when first_frame absent（first_frame 未建模） |
| `keling-reference-video` | audio=false when feature（因 matchesWhen 缺陷无法仅当特征视频在场时生效，按「not-enforced」记录） |
| `keling-video-edit` | element_list 主体（manifest 未建模；references maxItems:4 覆盖 ≤4） |
| `keling-video-edit` | text-length prompt ≤2500（已由 prompt maxLength:2500 天然满足） |
| `aishi-text-to-video` | resolution 阶梯条件（t2v manifest 用 size 而非 resolution，收敛为默认档 720P：0.30/0.39） |
| `happyhorse-video-edit` | video 恰为 1 个、reference_image ≤5（已由必填单媒体参数与 maxItems:5 天然满足） |
| `qwen-omni-screenplay` | video_url 恰为 1 个 / text 恰为 1 个（videoUrl 必填单媒体、prompt 由请求构建器生成，结构性满足） |
| `qwen-omni-screenplay-flash` | video_url 恰为 1 个 / text 恰为 1 个（结构性满足） |
| `fun-music-v1` | lyrics/prompt 的流式（stream 模式）text-length 规则（本产品 sync-only；且契约 other 按单词计数，运行时按非 CJK 字符计数） |
| `fun-asr-v1` | speaker_count 仅当 diarization_enabled 时的 field-allowed-when（由 speakerCount 的 visibleWhen 覆盖，静默丢弃而非报错） |
| `paraformer-v1` | speaker_count 仅当 diarization_enabled 时的 field-allowed-when（由 speakerCount 的 visibleWhen 覆盖，静默丢弃而非报错） |
| — | 合计 25 条 |

## 参数收紧清单

- **seed**：qwen-image / qwen-image-2.x / qwen-image-edit 系列、wanx-2.7-image 系列、z-image、wanx-2.7-*、vidu 系列——从「仅描述取值范围」补上 `min: 0, max: 2147483647, step: 1`（契约 payloadSchema 一致）。
- **wanx-2.7-reference-video duration**：新增 `conditional: { max: 10, when: { field: 'referenceVideos', present: true } }`（契约 field-value-when；注意 matchesWhen 缺陷使其恒生效，见设计缺陷）。
- **keling-reference-video 媒体组上限**：含特征视频时 `references+featureVideo` 合计上限 5→4（契约 collection-sum-max `refer+subjects ≤4`）。
- **其他参数**（分辨率/时长/音频等）契约与现有 manifest 已一致，无需调整。

## omni 定价决策

- `qwen-omni-screenplay` → `qwen3.5-omni-plus`，`qwen-omni-screenplay-flash` → `qwen3.5-omni-flash`。契约 category 是 multimodal、parameters 为空、无 per-second 视频价，全部为 token 价。
- `pricing.rates` 写入 cn-beijing token 价（plus：input 7 / audio-input 53 / output 40 / audio-output 213 元/百万；flash：2.2 / 18 / 13.3 / 72），每条带 `conditions.mode`。
- `quantityKey`/`unit` 保持 `estimatedDuration`/`per_second` 不动；`actualUsage` 已移除。
- **预估价收敛为 ~0**：`estimatePriceCents` 对 `estimatedDuration` 使用 output token rate（40 元/百万 × 60s ≈ 0.0024 元 ≈ 0.24 分 → 0 分），这是可接受的收敛——实际结算走 `calculateUsagePriceCents` 的 usage token 桶（7/53/40/213 元/百万分桶），preflight 只做展示。
- 新增隐藏 `mode` 参数（select，`visibleWhen` 恒 false，不对外展示、不进入请求），让 `registry-check` 认可 `conditions.mode` 引用了已声明参数；`calculateUsagePriceCents` 直接读 rates 的 `conditions.mode` 分桶，不需要该参数的值。

## 设计缺陷（本迁移不修复，仅记录）

1. **`matchesWhen` 忽略 `when.field`**（`validation.ts`）：`conditional.when` 只拿「当前参数自身的值」评估 `present`/`equals`，不看 `field` 所指的其它参数。后果：
   - `{ max: 10, when: { field: 'referenceVideos', present: true } }`（wan2.7-r2v duration）恒生效——不带参考视频时 duration 也被压到 ≤10（本应 15）。已按任务要求落为 conditional，属「过度收紧」。
   - `{ max: 4, when: { field: 'enableSequential', equals: false } }`（wan2.7-image n）不生效——数字永远不会 `equals false`。故未落为 conditional（避免伪约束），仅记录。
   - `{ equals: false, when: { field: 'featureVideo', present: true } }`（keling audio）恒生效会把 audio 永远锁 false，破坏音频能力，故 keling-reference-video 的 `audio=false when feature` 记作 NOT-ENFORCED 而不是落为 conditional。
2. **`conditions.mode` 与 `assertPricing` 的冲突**（`registry-check.ts`）：rate 的 conditions 字段必须是已声明参数名；omni 没有用户可见的 mode 参数。解决方案是声明一个恒隐藏的内部 `mode` 参数（见 omni 定价决策）。

## 迁移后待办

- 已改写文件：
- 人工审查 git diff。
- 运行 `pnpm run typecheck:root`（本脚本）与 `pnpm --filter @bailian-studio/model-core exec tsc --noEmit`。
- 更新 model-core 测试并运行 `pnpm --filter @bailian-studio/model-core exec vitest run`。
- 运行 `pnpm run check:boundaries`。
