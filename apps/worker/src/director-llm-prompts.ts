/**
 * 导演 LLM 阶段的中文 prompt 模板与运行输入快照。
 *
 * prompt 是版本化资产：措辞、JSON 契约示例与约束语句的任何变化都会影响线上
 * 生成质量与解析成功率，独立成模块便于评审与后续按阶段单测。解析器已各自
 * 位于 director-analysis / director-characters / ... 模块，与这里一一对应。
 */
import type { DirectorAnalysisResult, DirectorCharacter, DirectorCharactersResult, DirectorLocation, DirectorLocationsResult } from '@bailian-studio/director-contracts'
import { stringInput } from './director-text-phase'
import type { DirectorPhaseRunForWorker } from '@bailian-studio/director-repository'

export interface RunInputSnapshot {
  title: string
  synopsis: string | null
  storyText: string
  chatMessage?: string
  chatHistory?: Array<{ role: string; content: string }>
  analysis: unknown
  characters: unknown
  locations: unknown
  directorEntities?: {
    characters: DirectorCharacter[]
    locations: DirectorLocation[]
  }
  shots: unknown
  continuity: unknown
  music: unknown
  assembly: unknown
}

export function runInputSnapshot(run: DirectorPhaseRunForWorker): RunInputSnapshot {
  const snapshot = run.inputSnapshot
  return {
    title: stringInput(snapshot, 'title') ?? 'Untitled screenplay',
    synopsis: typeof snapshot['synopsis'] === 'string' ? snapshot['synopsis'] : null,
    storyText: stringInput(snapshot, 'storyText') ?? '',
    chatMessage: typeof snapshot['chatMessage'] === 'string' ? snapshot['chatMessage'] : undefined,
    chatHistory: Array.isArray(snapshot['chatHistory'])
      ? snapshot['chatHistory'].filter((entry): entry is { role: string; content: string } => (
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as Record<string, unknown>).role === 'string'
        && typeof (entry as Record<string, unknown>).content === 'string'
      ))
      : undefined,
    analysis: snapshot['analysis'],
    characters: snapshot['characters'],
    locations: snapshot['locations'],
    directorEntities: readDirectorEntities(snapshot['directorEntities']),
    shots: snapshot['shots'],
    continuity: snapshot['continuity'],
    music: snapshot['music'],
    assembly: snapshot['assembly'],
  }
}

export function analysisPrompt(title: string, synopsis: string | null, storyText: string): string {
  return [
    '你是一名专业短剧编剧与导演顾问。请分析下面的剧本。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"summary":"一句话梗概","theme":"主题","audience":"受众","structure":[{"name":"结构段落","purpose":"作用","beats":["关键节拍"]}],"characters":[{"name":"角色名","role":"角色功能","description":"角色描述","traits":["特质"]}],"locations":[{"name":"场景名","description":"场景描述","atmosphere":"氛围"}],"continuityRisks":["连续性风险"],"visualMotifs":["视觉母题"]}',
    '不要编造原文没有的关键事实；如果信息不足，使用空数组或明确写出不确定性。',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
    `剧本：\n${storyText}`,
  ].filter(Boolean).join('\n\n')
}

export function scriptChatPrompt(snapshot: RunInputSnapshot, message: string): string {
  const contractReminder = 'analysis must use only structure.name/purpose/beats, characters.name/role/description/traits, and locations.name/description/atmosphere; do not use scene, function, keyProps, or details aliases.'
  message = `${contractReminder}\n\n${message}`
  const history = snapshot.chatHistory?.map(entry => `${entry.role === 'user' ? '用户' : '编剧'}：${entry.content}`).join('\n') ?? '暂无历史对话'
  return [
    '你是一名专业短剧编剧、剧本医生和导演台编辑。用户正在通过聊天修改一部短剧。',
    '请根据用户本次要求，直接修改当前剧本，并返回一个 JSON 对象，不要返回 Markdown、代码围栏或 JSON 以外的解释。',
    'screenplay 必须是修改后的完整标准剧本全文，不是 diff，不是提纲，不是修改建议。即使用户只修改一个细节，也必须保留未修改部分。',
    '标准剧本至少应包含：片名、人物表、场次编号、内/外景与地点、时间、动作描述、角色名、情绪/表演提示和对白。场次使用清晰的场景标题，例如“1. 内景｜出租屋｜夜”。',
    '不要臆造用户没有提供的关键事实；信息不足时保留原内容或使用中性表达。对话中的修改优先于旧剧本，但不能破坏已经建立的故事因果、人物关系和场景连续性。',
    'analysis 必须严格符合现有剧本分析结构，供后续角色、场景和分镜阶段使用。reply 是给用户看的简短说明，changes 是本次实际修改点。',
    '{"reply":"已完成本次修改","screenplay":"完整标准剧本","synopsis":"一句话简介或 null","analysis":{"summary":"","theme":"","audience":"","structure":[],"characters":[],"locations":[],"continuityRisks":[],"visualMotifs":[]},"changes":["修改点"]}',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `当前简介：${snapshot.synopsis}`,
    `历史对话：\n${history}`,
    `当前剧本：\n${snapshot.storyText || '（当前还没有剧本，请根据用户要求从零开始创作标准剧本）'}`,
    `用户本次要求：\n${message}`,
  ].filter(Boolean).join('\n\n')
}

export function charactersPrompt(snapshot: RunInputSnapshot, analysis: DirectorAnalysisResult): string {
  return [
    '你是一名专业短剧编剧、导演和人物统筹顾问。请基于已确认的剧本分析，生成可供后续视觉资产和分镜阶段使用的角色卡。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"characters":[{"name":"角色名","role":"角色功能","description":"外在身份与核心设定","traits":["特质"],"goal":"当前目标","conflict":"核心冲突","arc":"角色弧线","visualSignature":"可用于视觉统一的外观特征"}],"relationshipNotes":["角色关系与戏剧张力"]}',
    '只使用剧本和分析中能够得到的事实；无法确认时要明确写出不确定性，不要凭空增加关键背景。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `已确认的剧本分析：\n${JSON.stringify(analysis)}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

export function locationsPrompt(snapshot: RunInputSnapshot, characters: DirectorCharactersResult): string {
  return [
    '你是一名专业短剧导演、场景设计和连续性统筹顾问。请基于角色卡与剧本原文，生成可供参考资产、分镜和视频提示词复用的场景卡。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"locations":[{"name":"场景名","description":"空间与叙事设定","atmosphere":"氛围","narrativeFunction":"场景在故事中的作用","timeOfDay":"时间","visualAnchors":["视觉锚点"],"continuityNotes":["连续性约束"]}],"continuityNotes":["跨场景连续性说明"]}',
    '只使用剧本原文和角色卡中能够得到的事实；不要虚构关键地点或事件。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `角色卡：\n${JSON.stringify(characters)}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

export function storyboardPrompt(
  snapshot: RunInputSnapshot,
  analysis: DirectorAnalysisResult,
  characters: DirectorCharactersResult,
  locations: DirectorLocationsResult,
): string {
  return [
    '你是一名专业短剧导演、分镜师和连续性统筹。请基于已经确认的剧本分析、角色卡、场景卡和当前有效导演实体，生成可供人工审核的分镜草稿。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    '每个 shot 必须是一个可独立审核的镜头，按 sequence 从 1 开始连续编号。不要自动生成视频，不要把图片资产 ID 编造进结果。',
    'JSON 必须符合以下结构：',
    '{"shots":[{"sequence":1,"sceneNumber":1,"slugline":"INT. 场景 - 时间","narrative":"镜头内发生的动作","camera":{"shotSize":"景别","angle":"机位","movement":"运动","lens":"镜头","composition":"构图"},"durationSeconds":5,"environmentPrompt":"环境画面提示词","videoPrompt":"动作与镜头运动提示词","negativePrompt":"负面提示词","dialogue":[{"speaker":"角色名","text":"对白","delivery":"语气"}],"referenceKeys":["角色名或场景名"],"continuity":{"前镜头衔接":"约束"}}]}',
    'sceneNumber、slugline、durationSeconds 可以为 null；没有对白时 dialogue 使用空数组。referenceKeys 只能填写当前有效导演实体中的角色或场景名称，必须逐字匹配，不要填写资产 ID、候选 ID 或未确认的名称。',
    '只使用输入中能够得到的事实；无法确认时保持克制，不要增加关键人物、地点或事件。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `剧本分析：\n${JSON.stringify(analysis)}`,
    `角色卡：\n${JSON.stringify(characters)}`,
    `场景卡：\n${JSON.stringify(locations)}`,
    `当前有效导演实体（referenceKeys 只能从这里选择）：\n${JSON.stringify(snapshot.directorEntities ?? { characters: [], locations: [] })}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}

function readDirectorEntities(value: unknown): RunInputSnapshot['directorEntities'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const characters = Array.isArray(record.characters) ? record.characters : []
  const locations = Array.isArray(record.locations) ? record.locations : []
  return {
    characters: characters.filter(isDirectorCharacter),
    locations: locations.filter(isDirectorLocation),
  }
}

function isDirectorCharacter(value: unknown): value is DirectorCharacter {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === 'string'
    && typeof (value as Record<string, unknown>).name === 'string'
}

function isDirectorLocation(value: unknown): value is DirectorLocation {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === 'string'
    && typeof (value as Record<string, unknown>).name === 'string'
}

/**
 * 实体提取：从剧本原文提取角色/场景/道具候选 + 逐字引用（mentions）。
 * mentions 必须是剧本原文的精确子串——服务端会用 indexOf 校验并计算偏移。
 */
export function entityExtractionPrompt(snapshot: RunInputSnapshot): string {
  return [
    '你是一名专业短剧制片人和剧本顾问。请从下面的剧本中提取所有重要的角色、场景和道具实体。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    '每个实体的 mentions 必须是剧本原文中的**精确子串**（逐字复制，不改写、不缩写、不翻译）。',
    '服务端会逐字校验 mentions 是否存在于剧本原文中；不存在的 mention 会被丢弃。',
    'JSON 必须符合以下结构：',
    '{"entities":[{"kind":"character","name":"角色名","description":"一句话描述","traits":["特质"],"mentions":["剧本原文的精确子串"]},{"kind":"scene","name":"场景名","description":"场景描述","traits":[],"mentions":["精确子串"]},{"kind":"prop","name":"道具名","description":"道具描述","traits":[],"mentions":["精确子串"]}]}',
    'kind 只能是 character、scene 或 prop。每个实体至少提供 1 个 mention。只在剧本中出现过至少一次的名字才值得提取。',
    '不要编造剧本中没有提到的实体。道具只提取对剧情有意义的物品（如关键信物、武器、车辆），不提取泛指的日常用品。',
    `项目：${snapshot.title}`,
    snapshot.synopsis === null ? '' : `简介：${snapshot.synopsis}`,
    `剧本原文：\n${snapshot.storyText}`,
  ].filter(Boolean).join('\n\n')
}
