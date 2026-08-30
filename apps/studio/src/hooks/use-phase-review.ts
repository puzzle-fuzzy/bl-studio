import { useState } from 'react'

/** 单个导演阶段审核区的本地编辑状态。 */
export function usePhaseReview<R>() {
  const [modelId, setModelId] = useState('')
  const [text, setText] = useState<string>()
  const [result, setResult] = useState<R>()
  const [stale, setStale] = useState(false)

  return { modelId, setModelId, text, setText, result, setResult, stale, setStale }
}
