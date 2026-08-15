import assert from 'node:assert/strict'
import { test } from 'node:test'

import { observeSession, parseEvents } from '../backtest/trajectory.mjs'

const SAMPLE = `{"type":"turn/start","data":{"turn":1}}
{"type":"user/message","data":{"content":[{"type":"text","text":"项目代码在哪个目录"}],"source":{"kind":"user"},"role":"user","id":"q1"}}
{"type":"user/message","data":{"content":[{"type":"text","text":"<long_term_memory>\\n- [USE #1 mem_8f3a2b1c9d4e fact] 项目代码位于 /home/ubuntu/dsh 目录\\n</long_term_memory>"}],"source":{"kind":"plugin"},"role":"user","id":"i1"}}
{"type":"assistant/message","data":{"turn":1,"step":1,"message":{"role":"assistant","content":[{"type":"text","text":"项目代码在 /home/ubuntu/dsh 目录"}]}}}
`

test('observeSession 提取 query / 注入 / assistant 文本', () => {
  const turns = observeSession(parseEvents(SAMPLE))
  assert.equal(turns.length, 1)
  const turn = turns[0]
  assert.equal(turn.turn, 1)
  assert.equal(turn.query, '项目代码在哪个目录')
  assert.equal(turn.injections.length, 1)
  assert.deepEqual(turn.injections[0].claimIds, ['mem_8f3a2b1c9d4e'])
  assert.ok(turn.assistantText.includes('项目代码在 /home/ubuntu/dsh 目录'))
})

test('observeSession 容忍损坏行', () => {
  const turns = observeSession(parseEvents('not-json\n{"type":"turn/start","data":{"turn":2}}\n'))
  assert.equal(turns.length, 1)
  assert.equal(turns[0].turn, 2)
})

test('claimIds 去重且只取 mem_ 格式，并抽出 claim 正文', () => {
  const block = '<long_term_memory>\n- [USE #1 mem_aaa fact] 项目代码在 A\n- [USE #2 mem_aaa fact] 项目代码在 B\n</long_term_memory>'
  const turns = observeSession([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: block }] } },
  ])
  assert.deepEqual(turns[0].injections[0].claimIds, ['mem_aaa'])
  assert.deepEqual(turns[0].injections[0].contents, ['项目代码在 A', '项目代码在 B'])
})
