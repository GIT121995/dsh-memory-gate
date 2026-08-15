/**
 * 结果层回测演示 —— 决策层只回答"该不该注入"；这里回答"注入后被用上了吗、值不值"。
 *
 * 对每个带 golden.assistant_answer 的场景：跑 gate → 对注入的 claim 算
 * 特有词项 → 在 assistant 最终回答里量采纳度 → 合成为效果分。
 * 纯离线、零模型调用（assistant_answer 是场景里写好的金标回答）。
 *
 * 用法：npm run result
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MemoryRepository, MemoryService, extractTerms } from '../lib/index.js'
import { adoptionScore, distinctiveTerms, effectScore, estimateTokens, qualitySignal } from './measure.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'fixtures', 'synthetic')

const CONFIG = {
  mode: 'assist',
  automaticExtraction: false,
  candidateLimit: 16,
  capsuleLimit: 2,
  injectionLimit: 3,
  maxInjectionChars: 1200,
  auditRetentionRuns: 5000,
  minUseBelief: 0.7,
  maxUseRisk: 0.45,
  harmfulQuarantineThreshold: 2,
  freshnessHalfLifeDays: 180,
}

function buildStore(scenario) {
  const repo = new MemoryRepository(':memory:')
  const svc = new MemoryService(repo, CONFIG)
  const idByIndex = new Map()
  scenario.claim_store.forEach((claim, index) => {
    const scope = claim.scope ?? 'global'
    const scopeKey = claim.scope_key ?? scope
    const { claim: created } = repo.remember({
      scope,
      scopeKey,
      kind: claim.kind,
      content: claim.content,
      origin: claim.origin ?? 'explicit',
      ...(claim.valid_until === undefined ? {} : { validUntil: claim.valid_until }),
    })
    idByIndex.set(index, created.id)
  })
  return { repo, svc, idByIndex }
}

const scenarios = readdirSync(FIXTURES)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))
  .filter((s) => s.golden?.assistant_answer && s.claim_store.length > 0)

const rows = []
for (const scenario of scenarios) {
  const { repo, svc, idByIndex } = buildStore(scenario)
  const retrieval = svc.retrieve({ query: scenario.query, sessionId: 'backtest', sessionScopeKey: 'backtest' })
  const injectedIndices = retrieval.decisions.filter((d) => d.action !== 'ignore').map((d) => {
    for (const [index, id] of idByIndex) if (id === d.claimId) return index
    return -1
  }).filter((i) => i >= 0)

  const queryTerms = extractTerms(scenario.query)
  const distinctive = new Set()
  let tokenCost = 0
  for (const index of injectedIndices) {
    const claim = repo.getClaim(idByIndex.get(index))
    if (!claim) continue
    for (const term of distinctiveTerms(claim.terms, queryTerms)) distinctive.add(term)
    tokenCost += estimateTokens(claim.content)
  }

  const adoption = adoptionScore([...distinctive], scenario.golden.assistant_answer)
  const quality = qualitySignal(scenario.golden.feedback)
  const effect = effectScore({ adoption, quality, tokenCost })
  rows.push({ scenario: scenario.scenario_id, injected: injectedIndices.length, adoption, quality, tokenCost, effect })
  repo.close()
}

console.log('| 场景 | 注入条数 | 采纳度 | 质量 | token 成本 | 效果分 |')
console.log('|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.scenario} | ${r.injected} | ${r.adoption.toFixed(2)} | ${r.quality.toFixed(1)} | ${r.tokenCost} | ${r.effect.toFixed(2)} |`)
}
if (rows.length) {
  const avgAdoption = rows.reduce((s, r) => s + r.adoption, 0) / rows.length
  const avgEffect = rows.reduce((s, r) => s + r.effect, 0) / rows.length
  console.log(`\n平均采纳度 ${avgAdoption.toFixed(2)}，平均效果分 ${avgEffect.toFixed(2)}`)
} else {
  console.log('\n（没有带 assistant_answer 的场景，结果层为空）')
}
