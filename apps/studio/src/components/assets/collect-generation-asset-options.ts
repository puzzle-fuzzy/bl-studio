import type { CreativeAssetReferenceRole, CreativeAssetType } from '@bailian-studio/api-client'

export const TYPE_OPTIONS: Array<{ value: CreativeAssetType; label: string }> = [
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
]

export const ROLE_OPTIONS: Record<CreativeAssetType, Array<{ value: CreativeAssetReferenceRole; label: string }>> = {
  character: [
    { value: 'front', label: '正面' },
    { value: 'three_quarter', label: '三分之四侧面' },
    { value: 'side', label: '侧面' },
    { value: 'back', label: '背面' },
    { value: 'full_body', label: '全身' },
    { value: 'medium', label: '中景' },
    { value: 'face_closeup', label: '面部特写' },
  ],
  environment: [
    { value: 'wide', label: '广角' },
    { value: 'medium', label: '中景' },
    { value: 'detail', label: '细节' },
    { value: 'other', label: '其他' },
  ],
  prop: [
    { value: 'isolated', label: '孤立物体' },
    { value: 'detail', label: '细节' },
    { value: 'interaction', label: '交互状态' },
    { value: 'other', label: '其他' },
  ],
  style: [
    { value: 'style_board', label: '风格板' },
    { value: 'other', label: '其他' },
  ],
}
