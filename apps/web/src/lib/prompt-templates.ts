/**
 * 提示词模板库（纯函数）。按模型类别提供「起点提示词」，点击填入表单。
 */

export interface PromptTemplate {
  id: string
  label: string
  prompt: string
}

const TEMPLATES: Record<string, PromptTemplate[]> = {
  image: [
    { id: 'image-portrait', label: '人物肖像', prompt: '一位年轻女性的高清肖像，柔和自然光，浅景深，专业摄影质感' },
    { id: 'image-landscape', label: '风景', prompt: '壮丽的山脉日出，金色晨光洒在云海上，超写实风格，细节丰富' },
    { id: 'image-illustration', label: '插画', prompt: '一只猫在月光下的屋顶上，日系动漫插画风格，色彩鲜明，干净线条' },
    { id: 'image-product', label: '产品', prompt: '极简风格的白色咖啡杯，纯色背景，商业产品摄影，柔和打光' },
  ],
  video: [
    { id: 'video-timelapse', label: '延时摄影', prompt: '城市天际线的日出延时摄影，云层流动，光线变化，画面平稳' },
    { id: 'video-cinematic', label: '电影感', prompt: '雨天街道上撑伞行人的电影镜头，浅景深，青橙色调，电影级质感' },
    { id: 'video-nature', label: '自然', prompt: '瀑布从翠绿山崖倾泻而下，水花飞溅，阳光透过水雾形成彩虹' },
  ],
  audio: [
    { id: 'audio-focus', label: '轻音乐', prompt: '舒缓的钢琴轻音乐，适合专注，轻柔的旋律，治愈系' },
    { id: 'audio-cinematic', label: '氛围音乐', prompt: '史诗般的电影配乐，弦乐与打击乐渐强，情绪饱满' },
  ],
  text: [
    { id: 'text-poem', label: '短诗', prompt: '以「秋天的车站」为主题写一首现代短诗' },
    { id: 'text-copy', label: '文案', prompt: '为一款智能手环写三条社交媒体推广文案' },
  ],
}

const FALLBACK: PromptTemplate[] = [
  { id: 'fallback', label: '通用', prompt: '请描述你想要生成的内容，越具体越好' },
]

export function promptTemplatesForCategory(category: string | undefined): PromptTemplate[] {
  return TEMPLATES[category ?? ''] ?? FALLBACK
}
