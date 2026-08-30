import { describe, expect, it } from 'vitest'
import {
  referenceMarker,
  providerSyntaxFor,
  resolvePromptReferences,
  restorePromptReferences,
  extractReferenceIndexes,
  resolvedPromptLength,
  parsePromptReferences,
  filterReferenceAssets,
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

  describe('filterReferenceAssets', () => {
    const assets = [
      { fileName: '猫的参考.png' },
      { fileName: 'Sunset.png' },
      { fileName: null },
    ]

    it('空查询返回全量（顺序不变）', () => {
      expect(filterReferenceAssets(assets, '')).toEqual(assets)
      expect(filterReferenceAssets(assets, '   ')).toEqual(assets)
    })

    it('按「图N」序号匹配', () => {
      expect(filterReferenceAssets(assets, '图1')).toEqual([assets[0]])
      expect(filterReferenceAssets(assets, '图2')).toEqual([assets[1]])
      expect(filterReferenceAssets(assets, '图3')).toEqual([assets[2]])
    })

    it('按文件名匹配（不区分大小写）', () => {
      expect(filterReferenceAssets(assets, '猫')).toEqual([assets[0]])
      expect(filterReferenceAssets(assets, 'sunset')).toEqual([assets[1]])
    })

    it('无匹配返回空数组', () => {
      expect(filterReferenceAssets(assets, '不存在')).toEqual([])
    })
  })

  describe('parsePromptReferences', () => {
    it('splits text and image-bracket markers', () => {
      expect(parsePromptReferences('缓缓站起身来 [Image 1] 然后转身', 'image-bracket')).toEqual([
        { type: 'text', text: '缓缓站起身来 ' },
        { type: 'image', raw: '[Image 1]', index: 1 },
        { type: 'text', text: ' 然后转身' },
      ])
    })

    it('splits angle-bracket and chinese markers', () => {
      expect(parsePromptReferences('主角 <<<image_2>>> 走路', 'angle-bracket')).toEqual([
        { type: 'text', text: '主角 ' },
        { type: 'image', raw: '<<<image_2>>>', index: 2 },
        { type: 'text', text: ' 走路' },
      ])
      expect(parsePromptReferences('图1 从图2 身后走出', 'chinese')).toEqual([
        { type: 'image', raw: '图1', index: 1 },
        { type: 'text', text: ' 从' },
        { type: 'image', raw: '图2', index: 2 },
        { type: 'text', text: ' 身后走出' },
      ])
    })

    it('unknown format still parses unambiguous markers', () => {
      expect(parsePromptReferences('人物 [Image 3] 奔跑', undefined)).toEqual([
        { type: 'text', text: '人物 ' },
        { type: 'image', raw: '[Image 3]', index: 3 },
        { type: 'text', text: ' 奔跑' },
      ])
      expect(parsePromptReferences('猫 <<<image_1>>> 跳', undefined)).toEqual([
        { type: 'text', text: '猫 ' },
        { type: 'image', raw: '<<<image_1>>>', index: 1 },
        { type: 'text', text: ' 跳' },
      ])
    })

    it('unknown format does not treat 图N as a reference', () => {
      expect(parsePromptReferences('参考图1 的样式', undefined)).toEqual([
        { type: 'text', text: '参考图1 的样式' },
      ])
    })

    it('returns a single text segment for prompt without markers', () => {
      expect(parsePromptReferences('一只奔跑的猫', 'image-bracket')).toEqual([
        { type: 'text', text: '一只奔跑的猫' },
      ])
    })
  })
})
