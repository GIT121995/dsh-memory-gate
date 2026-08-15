import assert from 'node:assert/strict'
import { test } from 'node:test'

import { adoptionScore, distinctiveTerms, effectScore, estimateTokens, qualitySignal } from '../backtest/measure.mjs'

test('estimateTokens: CJK ~1/字，latin ~1/4 字符', () => {
  assert.equal(estimateTokens('中文'), 2)
  assert.ok(estimateTokens('abcd') >= 1)
  assert.ok(estimateTokens('中文 abcd') >= 3)
})

test('distinctiveTerms 排除 query 词项', () => {
  const distinctive = distinctiveTerms(['简洁', '中文', '目录'], ['简洁'])
  assert.deepEqual(distinctive, ['中文', '目录'])
})

test('adoptionScore 度量特有词项命中比例', () => {
  const distinctive = ['目录']
  assert.equal(adoptionScore(distinctive, '项目代码在 /home/ubuntu/dsh 目录'), 1)
  assert.equal(adoptionScore(distinctive, '这个我不清楚'), 0)
  // 同义折叠在「别名令牌」层生效：claim 词项含 recall_alias_deploy，
  // 回答里说「上线」也会折叠到同一令牌，从而命中。
  assert.equal(adoptionScore(['recall_alias_deploy'], '上线流程是这样的'), 1)
})

test('adoptionScore 空特有词返回 0（无信号不算采纳）', () => {
  assert.equal(adoptionScore([], '随便'), 0)
})

test('effectScore 正采纳加分、成本减分、有界', () => {
  const good = effectScore({ adoption: 1, quality: 1, tokenCost: 0 })
  assert.ok(good > 0.9)
  const costly = effectScore({ adoption: 1, quality: 1, tokenCost: 2000, costWeight: 0.002 })
  assert.ok(costly < good, '成本应拉低效果分')
  assert.equal(effectScore({ adoption: 0, quality: 0, tokenCost: 1e9 }), -1, '有下界 -1')
  assert.equal(effectScore({ adoption: 1, quality: 1, tokenCost: 1e9 }), 0, '满分减满成本惩罚为 0')
})

test('qualitySignal 映射反馈到质量', () => {
  assert.equal(qualitySignal('helped'), 1)
  assert.equal(qualitySignal('harmful'), 0)
  assert.equal(qualitySignal(undefined), 0.5)
})
