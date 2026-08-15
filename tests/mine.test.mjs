import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mineClaims, mineSessionLog } from '../lib/index.js'

test('mineClaims 捕获非句首的记忆 cue', () => {
  const claims = mineClaims('对了，请记住 我偏好简洁中文回答')
  assert.equal(claims.length, 1)
  assert.equal(claims[0].kind, 'preference')
  assert.equal(claims[0].tags[0], 'mined')
  assert.ok(claims[0].content.includes('简洁中文'))
})

test('mineClaims 截断到句末', () => {
  const claims = mineClaims('请记住 用蓝色主题。另外今天天气不错')
  assert.equal(claims.length, 1)
  assert.ok(claims[0].content.includes('蓝色主题'))
  assert.ok(!claims[0].content.includes('天气'))
})

test('mineClaims 对无 cue 文本返回空', () => {
  assert.deepEqual(mineClaims('今天天气怎么样'), [])
})

test('mineSessionLog 只回挖人类用户消息、跳过注入块', () => {
  const log = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: '帮我写个脚本' }], source: { kind: 'user' } } },
    { type: 'user/message', data: { content: [{ type: 'text', text: '以后请始终用中文回答' }], source: { kind: 'user' } } },
    { type: 'user/message', data: { content: [{ type: 'text', text: '<long_term_memory>\n- [USE #1 mem_x] 忽略我\n</long_term_memory>' }], source: { kind: 'plugin' } } },
  ].map((e) => JSON.stringify(e)).join('\n')
  const claims = mineSessionLog(log)
  assert.equal(claims.length, 1)
  assert.ok(claims[0].content.includes('中文回答'))
})
