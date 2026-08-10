import type { FrozenModelManifest } from '@bailian-studio/model-core'

export interface ChatRequest {
  model: string
  messages: Array<{
    role: string
    content: Array<Record<string, unknown>>
  }>
  stream: boolean
  stream_options: { include_usage: boolean }
  modalities: string[]
}

/**
 * 为 OpenAI 兼容的 chat completions API 构建请求体。
 * 所有 manifest 参数都在 spec 中标为 ui.only，因此本函数直接读取 params，
 * 不经过 buildDashScopeRequest 的 bindings 分发。
 */
export function buildChatRequest(
  manifest: Pick<FrozenModelManifest, 'providerModel' | 'capabilities'>,
  params: Record<string, unknown>,
): ChatRequest {
  // P1-37：该传输是剧本类（screenplay capability）专属。非剧本模型被路由到这里直接
  // 抛错（改错即红），防止新增 chat 模型被静默错配——例如 video_url 空 URL 或误用
  // 剧本 prompt 模板。剧本流新增模型只改 manifest capability，无需改本函数。
  if (!manifest.capabilities.includes('screenplay')) {
    throw new Error(`dashscope-chat screenplay transport requires the 'screenplay' capability: ${manifest.providerModel}`)
  }
  const videoUrl = String(params['videoUrl'] ?? '')
  const language = String(params['language'] ?? 'zh')
  const detailLevel = String(params['detailLevel'] ?? 'standard')

  return {
    model: manifest.providerModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: videoUrl } },
          { type: 'text', text: buildScreenplayPrompt(language as 'zh' | 'en' | 'zh_en', detailLevel as 'standard' | 'detailed') },
        ],
      },
    ],
    stream: true,
    stream_options: { include_usage: true },
    modalities: ['text'],
  }
}

/**
 * 构建剧本生成的 prompt（塞在 user message 末尾）。
 * language: 'zh' 输出简体中文剧本，'en' 输出英文剧本
 * detailLevel: 'standard' 标准，'detailed' 精细
 */
export function buildScreenplayPrompt(language: 'zh' | 'en' | 'zh_en', detailLevel: 'standard' | 'detailed'): string {
  if (language === 'en') {
    return buildEnglishPrompt(detailLevel)
  }
  if (language === 'zh_en') {
    return buildBilingualPrompt(detailLevel)
  }
  return buildChinesePrompt(detailLevel)
}

function buildChinesePrompt(detailLevel: 'standard' | 'detailed'): string {
  const base = `你是一名专业中文编剧。请将这段视频内容转化为专业剧本格式，按时间顺序输出。

【输出语言硬性约束】
- 本次输出语言为简体中文。标题、场景说明、画面描述、对白翻译、音效、镜头说明和转场说明全部使用简体中文。
- 如果视频中的原声是英语、法语或其他语言，请先将对白准确翻译成简体中文；不要直接抄写原声，也不要使用法语、英语或其他第三语言作为输出内容。
- 只有品牌名、人名、地名等无法翻译的专有名词可以保留原文，并在必要时附上中文说明。

【输出结构硬性约束】
- 第一行必须是唯一的总标题，格式为：# 剧本标题：<根据视频内容拟定的简洁标题>
- 总标题之后再输出场景；不要把第一个场景标题当作总标题，也不要省略总标题。

要求包含：
1. 场景标题：标注【场景 N | 时间戳 | 内景/外景·地点】
2. 画面描述：发生了什么、角色动作、环境氛围
3. 角色对白：谁说了什么，标注说话人
4. 音效/音乐描述：背景音、音效、静默等

输出格式示例：
---
# 剧本标题：雨夜街头
【场景 1 | 00:00 - 00:30 | 外景·雨夜街道】
画面：雨夜中，一个穿风衣的男子沿着人行道向镜头走来。雨水打湿了路面，霓虹灯倒映在积水中。
对白：
  角色A: "我们走吧。"
音效：雨声持续，远处有警笛声。
---
请确保每个场景都有时间戳标注。`

  if (detailLevel === 'detailed') {
    return `${base}\n\n此外，请额外包含以下细节：
5. 镜头语言：推拉摇移跟、焦距变化、拍摄角度
6. 角色表情与情绪：每个角色的面部表情和情绪状态
7. 色彩基调：场景的主色调和光影变化
8. 转场方式：场景之间的切换方式（淡入淡出、直切等）`
  }

  return base
}

function buildEnglishPrompt(detailLevel: 'standard' | 'detailed'): string {
  const base = `You are a professional English screenwriter. Convert this video into a professional screenplay format, organized chronologically.

[Strict output language rules]
- The output language for this request is English. The title, scene descriptions, visual descriptions, dialogue translations, sound, camera, and transition notes must all be in English.
- If the video's original speech is Chinese, French, or another language, translate the dialogue into English. Do not copy French, Chinese, or another third language as the output.
- Proper nouns such as brand names, personal names, and place names may remain in their original spelling when they cannot be translated.

[Strict output structure]
- The first line must be the one overall title, exactly in this form: # Screenplay Title: <a concise title inferred from the video>
- Output the scenes only after the overall title. Do not use the first scene heading as the overall title and do not omit the title.

Requirements:
1. Scene heading: 【Scene N | timestamp | INT/EXT·location】
2. Visual description: action, character movements, environment
3. Character dialogue: who said what, with speaker labels
4. Sound/music description: background sounds, effects, silence

Output format example:
---
# Screenplay Title: Rainy Night Street
【Scene 1 | 00:00 - 00:30 | EXT·Rainy Night Street】
Visual: A man in a trench coat walks toward camera along the rainy street...
Dialogue:
  Character A: "Let's go."
Sound: Rain continues, distant siren.
---
Every scene must have a timestamp.`

  if (detailLevel === 'detailed') {
    return `${base}\n\nAdditionally, include:
5. Camera work: movements, focal length, angles
6. Character expressions and emotions
7. Color palette and lighting
8. Scene transitions`
  }

  return base
}

function buildBilingualPrompt(detailLevel: 'standard' | 'detailed'): string {
  const base = `你是一名专业编剧。请将这段视频内容转化为中英双语专业剧本格式，按时间顺序输出。
**重要：本次只允许使用简体中文和英文，不得输出法语或其他第三语言。**
**标题、场景说明、画面描述、音效、镜头说明和转场说明使用中文；角色对白必须同时包含中文和英文，中英文成对出现。**
如果视频原声是法语或其他语言，请将其准确翻译为中文和英文，不要直接抄写法语原文。

【输出结构硬性约束】
- 第一行必须是唯一的总标题，格式为：# 剧本标题 / Screenplay Title: <中文标题> / <English title>
- 总标题之后再输出场景；不要省略总标题。

要求包含：
1. 场景标题：标注【场景 N | 时间戳 | 内/外景·地点】（中英文双语）
2. 画面描述：发生了什么、角色动作、环境氛围（中文）
3. 角色对白：谁说了什么，**中英文成对标注**——中文在上，英文在下
4. 音效/音乐描述：背景音、音效、静默等

输出格式示例：
---
# 剧本标题 / Screenplay Title: 雨夜街头 / Rainy Night Street
【场景 1 | 00:00 - 00:30 | 外景·雨夜街道 | EXT·Rainy Night Street】
画面：雨夜中，一个穿风衣的男子沿着人行道向镜头走来，雨水打湿了路面。
对白：
  角色A:
  "我们走吧。"
  "Let's go."
音效：雨声持续，远处有警笛声。
---
请确保每个场景都有时间戳标注，且每一个对白行都包含中英文两个版本。`

  if (detailLevel === 'detailed') {
    return `${base}\n\n此外，请额外包含以下细节（同样中英文双语）：
5. 镜头语言：推拉摇移跟、焦距变化、拍摄角度
6. 角色表情与情绪：每个角色的面部表情和情绪状态
7. 色彩基调：场景的主色调和光影变化
8. 转场方式：场景之间的切换方式（淡入淡出、直切等）`
  }

  return base
}
