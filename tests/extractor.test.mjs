import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractDurableClaims } from '../lib/index.js'

test('句首 cue 仍可提取', () => {
  const claims = extractDurableClaims('记住 我偏好简洁中文回答')
  assert.equal(claims.length, 1)
  assert.equal(claims[0].kind, 'preference')
  assert.ok(claims[0].content.includes('简洁中文'))
})

test('句中 cue 也能提取，且丢弃前缀', () => {
  const claims = extractDurableClaims('今天天气不错，另外记住用蓝色主题')
  assert.equal(claims.length, 1)
  assert.equal(claims[0].content, '用蓝色主题')
  assert.ok(!claims[0].content.includes('天气'))
})

test('提取截断到句末', () => {
  const claims = extractDurableClaims('记住 用蓝色主题。另外今天天气不错')
  assert.equal(claims.length, 1)
  assert.equal(claims[0].content, '用蓝色主题')
})

test('疑问句不提取（记住…吗？）', () => {
  assert.deepEqual(extractDurableClaims('记住用蓝色主题吗？'), [])
})

test('无 cue 文本返回空', () => {
  assert.deepEqual(extractDurableClaims('帮我写个脚本'), [])
})
