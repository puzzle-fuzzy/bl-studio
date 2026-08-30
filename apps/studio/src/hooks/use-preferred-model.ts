import { useEffect, type Dispatch, type SetStateAction } from 'react'

export interface ModelOption {
  id: string
}

/** 当当前模型不存在于目录时，回退到指定首选模型或目录第一项。 */
export function usePreferredModel(
  modelId: string,
  models: readonly ModelOption[],
  setModelId: Dispatch<SetStateAction<string>>,
  preferredId?: string,
): void {
  useEffect(() => {
    if (modelId.length > 0 && models.some(model => model.id === modelId)) return
    const preferred = (preferredId === undefined
      ? undefined
      : models.find(model => model.id === preferredId)) ?? models[0]
    if (preferred !== undefined) setModelId(preferred.id)
  }, [modelId, models, preferredId, setModelId])
}
