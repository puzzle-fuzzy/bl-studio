import { describe, expect, it } from 'vitest'
import { isDashScopeArtifactHost } from '../src/artifact-host'

describe('isDashScopeArtifactHost', () => {
  it('accepts current and legacy DashScope OSS result hosts', () => {
    expect(isDashScopeArtifactHost('dashscope-7c2c.oss-accelerate.aliyuncs.com')).toBe(true)
    expect(isDashScopeArtifactHost('dashscope-result-7c2c.oss-cn-beijing.aliyuncs.com')).toBe(true)
    expect(isDashScopeArtifactHost('DASHSCOPE-7C2C.OSS-ACCELERATE.ALIYUNCS.COM.')).toBe(true)
  })

  it('rejects arbitrary or malformed aliyuncs hosts', () => {
    expect(isDashScopeArtifactHost('example.oss-accelerate.aliyuncs.com')).toBe(false)
    expect(isDashScopeArtifactHost('dashscope-7c2c.bucket.aliyuncs.com')).toBe(false)
    expect(isDashScopeArtifactHost('dashscope-.oss-accelerate.aliyuncs.com')).toBe(false)
    expect(isDashScopeArtifactHost('dashscope-7c2c.oss-accelerate.aliyuncs.com.evil.test')).toBe(false)
  })
})
