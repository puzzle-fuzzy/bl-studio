import { describe, expect, it } from 'vitest'
import {
  referenceMarker,
  providerSyntaxFor,
  resolvePromptReferences,
  restorePromptReferences,
  extractReferenceIndexes,
  resolvedPromptLength,
} from './reference-format'

describe('reference-format', () => {
  it('maps reference index to neutral editing marker', () => {
    expect(referenceMarker(1)).toBe('@图1')
    expect(referenceMarker(2)).toBe('@图2')
  })

  it('renders provider syntax for each format', () => {
    expect(providerSyntaxFor('angle-bracket', 1)).toBe('<<<image_1>>>')
    expect(providerSyntaxFor('image-bracket', 2)).toBe('[Image 2]')
    expect(providerSyntaxFor('chinese', 3)).toBe('图3')
  })

  it('resolves markers to provider syntax', () => {
    expect(resolvePromptReferences('一只猫 @图1 奔跑', 'angle-bracket')).toBe(
      '一只猫 <<<image_1>>> 奔跑',
    )
    expect(resolvePromptReferences('一只猫 @图1 奔跑', 'image-bracket')).toBe('一只猫 [Image 1] 奔跑')
  })

  it('restores provider syntax back to markers', () => {
    expect(restorePromptReferences('一只猫 <<<image_1>>> 奔跑', 'angle-bracket')).toBe('一只猫 @图1 奔跑')
    expect(restorePromptReferences('一只猫 [Image 2] 奔跑', 'image-bracket')).toBe('一只猫 @图2 奔跑')
  })

  it('extracts reference indexes in order', () => {
    expect(extractReferenceIndexes('@图3 @图1 @图2')).toEqual([3, 1, 2])
  })

  it('counts resolved prompt length', () => {
    expect(resolvedPromptLength('一只猫 @图1', 'angle-bracket')).toBe(
      '一只猫 <<<image_1>>>'.length,
    )
  })
})
