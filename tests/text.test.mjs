import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractTerms, mergeLearnedTerms, normalizeForTerms, SYNONYM_GROUPS, termOverlap } from '../lib/index.js'

test('normalizeForTerms folds full-width and common traditional forms', () => {
  assert.equal(normalizeForTerms('ＡＢＣ１２３'), 'abc123')
  assert.equal(normalizeForTerms('記憶閘門'), '记忆闸门')
  assert.equal(normalizeForTerms('設定・軟體'), '设定・软体')
})

test('extractTerms drops latin stopwords and stop-character han bigrams', () => {
  const terms = extractTerms('the answer is concise for my project')
  assert.ok(terms.includes('answer'))
  assert.ok(terms.includes('concise'))
  assert.ok(!terms.includes('the'))
  assert.ok(!terms.includes('for'))
  assert.ok(!terms.includes('my'))

  const han = extractTerms('我的中文回答')
  assert.ok(!han.includes('我的'))
  assert.ok(!han.includes('的中'))
  assert.ok(han.includes('中文'))
  assert.ok(han.includes('回答'))
})

test('extractTerms folds synonym groups into stable alias tokens', () => {
  const zh = extractTerms('漢語')
  assert.ok(zh.includes('recall_alias_chinese'))

  const en = extractTerms('prefer')
  assert.ok(en.includes('recall_alias_prefer'))

  const groups = SYNONYM_GROUPS.map((group) => group.id)
  assert.ok(groups.includes('chinese'))
  assert.ok(groups.includes('prefer'))
})

test('mergeLearnedTerms dedupes, blocks base terms, and caps', () => {
  const result = mergeLearnedTerms(['已有'], ['已有', '新词', '基础词', '超额1', '超额2'], 3, ['基础词'])
  assert.deepEqual(result.terms, ['已有', '新词', '超额1'])
  assert.deepEqual(result.added, ['新词', '超额1'])
})

test('alias tokens are stable across group order changes', () => {
  const expected = SYNONYM_GROUPS.map((group) => `recall_alias_${group.id}`).sort()
  const actual = [...expected].sort()
  assert.deepEqual(actual, expected)
})

test('termOverlap 度量词项重叠率', () => {
  assert.equal(termOverlap([], []), 0)
  assert.equal(termOverlap(['简洁', '中文'], ['简洁', '中文']), 1)
  // 交叠 2 / min(3,3) = 0.67
  const ratio = termOverlap(['简洁', '中文', '回答'], ['简洁', '中文', '答复'])
  assert.ok(ratio > 0.6 && ratio < 0.7, `期望 ~0.67，实际 ${ratio}`)
  assert.equal(termOverlap(['a'], ['b']), 0)
})
