/**
 * 决策层回测引擎 —— gate 的「因子回测」。
 *
 * 四条腿对照同一批合成场景：
 *   gate   真实 retrieve → CBDC 决策（use|verify 记为注入，ignore 记为不注入）
 *   top-3  无门控基线：词法检索 top-3 全注入（capsule 不参与）
 *   random 随机注入（固定种子，可复现）
 *   shadow 零注入基线
 *
 * 两层评分：
 *   - 注入集合 vs 金标（claim 级精确率/召回率/F1，四腿对照）
 *   - gate 的动作（use/verify/ignore）vs 金标 expected_action（仅 gate 腿）
 *
 * 硬案例（hard=true）与清晰案例分开计分：硬案例记录已知短板、不阻塞发版；
 * CI 门只要求清晰场景全对（clear F1 == 1.0）。
 *
 * 用法：npm run backtest
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MemoryRepository, MemoryService } from '../lib/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'fixtures', 'synthetic')
const REPORTS = join(ROOT, 'reports')
const INJECTION_LIMIT = 3

const CONFIG = {
  mode: 'assist',
  automaticExtraction: false,
  candidateLimit: 16,
  capsuleLimit: 2,
  injectionLimit: INJECTION_LIMIT,
  maxInjectionChars: 1200,
  auditRetentionRuns: 5000,
  minUseBelief: 0.7,
  maxUseRisk: 0.45,
  harmfulQuarantineThreshold: 2,
  freshnessHalfLifeDays: 180,
}

const loadScenarios = () =>
  readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))

const seededRandom = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function buildStore(scenario) {
  const repo = new MemoryRepository(':memory:')
  const svc = new MemoryService(repo, CONFIG)
  const idToIndex = new Map()
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
    idToIndex.set(created.id, index)
    for (let i = 0; i < (claim.harmful_bootstrap ?? 0); i += 1) {
      repo.recordConsumption(created.id, 'harmful', 'backtest-bootstrap')
    }
  })
  return { repo, svc, idToIndex }
}

function runScenario(scenario) {
  const { repo, svc, idToIndex } = buildStore(scenario)
  const goldenSet = new Set(scenario.golden.inject ?? [])
  const expectedAction = (index) => (goldenSet.has(index) ? scenario.golden.expected_action : 'ignore')

  const retrieval = svc.retrieve({ query: scenario.query, sessionId: 'backtest', sessionScopeKey: 'backtest' })
  const gateDecisions = retrieval.decisions.map((d) => ({ index: idToIndex.get(d.claimId), action: d.action }))
  const gateInject = new Set(gateDecisions.filter((d) => d.action !== 'ignore').map((d) => d.index))

  const topCandidates = repo.search(scenario.query, ['global'], INJECTION_LIMIT)
  const topInject = new Set(topCandidates.map((c) => idToIndex.get(c.claim.id)).filter((i) => i !== undefined))

  const rand = seededRandom(0x5eed + scenario.claim_store.length)
  const pool = scenario.claim_store.map((_, i) => i)
  const randomInject = new Set()
  for (let i = 0; i < Math.min(INJECTION_LIMIT, pool.length); i += 1) {
    const pick = Math.floor(rand() * pool.length)
    randomInject.add(pool[pick])
    pool.splice(pick, 1)
  }

  const shadowInject = new Set()

  const actionCorrect = scenario.claim_store.every((_, index) => {
    const actual = gateDecisions.find((d) => d.index === index)?.action ?? 'ignore'
    return actual === expectedAction(index)
  })

  repo.close()
  return { scenario, goldenSet, gateInject, topInject, randomInject, shadowInject, actionCorrect }
}

const setsEqual = (a, b) => {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}
const fmt = (set) => (set.size === 0 ? '∅' : [...set].sort((a, b) => a - b).join(','))

function aggregate(results) {
  const acc = { gate: { tp: 0, fp: 0, fn: 0 }, 'top-3': { tp: 0, fp: 0, fn: 0 }, random: { tp: 0, fp: 0, fn: 0 }, shadow: { tp: 0, fp: 0, fn: 0 } }
  const injectOf = (r, name) => (name === 'gate' ? r.gateInject : name === 'top-3' ? r.topInject : name === 'random' ? r.randomInject : r.shadowInject)
  for (const r of results) {
    for (const name of Object.keys(acc)) {
      const inject = injectOf(r, name)
      r.scenario.claim_store.forEach((_, index) => {
        const label = r.goldenSet.has(index)
        const predict = inject.has(index)
        if (predict && label) acc[name].tp += 1
        else if (predict && !label) acc[name].fp += 1
        else if (!predict && label) acc[name].fn += 1
      })
    }
  }
  return acc
}

function prf(acc, name) {
  const { tp, fp, fn } = acc[name]
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1, tp, fp, fn }
}

const scenarios = loadScenarios()
const results = scenarios.map(runScenario)
const clear = results.filter((r) => r.scenario.golden.hard !== true)
const hard = results.filter((r) => r.scenario.golden.hard === true)

const clearAgg = aggregate(clear)
const hardAgg = aggregate(hard)

const lines = []
lines.push('# gate 决策层回测报告（合成场景）')
lines.push('')
lines.push(`场景总数 ${scenarios.length}（清晰 ${clear.length} / 硬案例 ${hard.length}）`)
lines.push('')
lines.push('| 场景 | 金标 | gate | top-3 | random | shadow | 结果 |')
lines.push('|---|---|---|---|---|---|---|')

for (const r of results) {
  const isHard = r.scenario.golden.hard === true
  const ok = setsEqual(r.gateInject, r.goldenSet) && r.actionCorrect
  const mark = isHard ? '⚠️' : ok ? '✓' : '✗'
  lines.push(
    `| ${r.scenario.scenario_id}${isHard ? ' (hard)' : ''} | ${fmt(r.goldenSet)} | ${fmt(r.gateInject)} | ${fmt(r.topInject)} | ${fmt(r.randomInject)} | ${fmt(r.shadowInject)} | ${mark} |`,
  )
}

const metricTable = (title, agg, results) => {
  lines.push('')
  lines.push(`## ${title}`)
  lines.push('')
  lines.push('| 腿 | 精确率 | 召回率 | F1 | TP/FP/FN |')
  lines.push('|---|---|---|---|---|')
  for (const name of ['gate', 'top-3', 'random', 'shadow']) {
    const m = prf(agg, name)
    lines.push(`| ${name} | ${m.precision.toFixed(2)} | ${m.recall.toFixed(2)} | ${m.f1.toFixed(2)} | ${m.tp}/${m.fp}/${m.fn} |`)
  }
  const actionOk = results.filter((r) => r.actionCorrect).length
  lines.push('')
  lines.push(`gate 动作全对：${actionOk}/${results.length}`)
}

metricTable('清晰场景（CI 门依据）', clearAgg, clear)
metricTable('硬案例（已知短板，不阻塞）', hardAgg, hard)

const clearPass = clear.filter((r) => setsEqual(r.gateInject, r.goldenSet) && r.actionCorrect).length
const clearF1 = prf(clearAgg, 'gate').f1
const hardFails = hard.filter((r) => !(setsEqual(r.gateInject, r.goldenSet) && r.actionCorrect)).map((r) => r.scenario.scenario_id)

lines.push('')
lines.push('## 结论')
lines.push(`- 清晰场景通过：${clearPass}/${clear.length}`)
if (hardFails.length) lines.push(`- 已知硬案例（待攻）：${hardFails.join(', ')}`)
else lines.push('- 硬案例全部通过（无已知短板）')

const report = lines.join('\n')
console.log(report)

mkdirSync(REPORTS, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
writeFileSync(join(REPORTS, `backtest-${ts}.md`), report + '\n')

// CI 门：清晰场景 gate 必须全对（即 clear F1 == 1.0，动作全对）。
const pass = clearPass === clear.length && clearF1 >= 0.999
if (!pass) {
  console.error(`\n[CI gate] FAILED: clear ${clearPass}/${clear.length}, clear F1=${clearF1.toFixed(3)}`)
  process.exit(1)
}
console.log(`\n[CI gate] PASSED: clear ${clearPass}/${clear.length}, clear F1=${clearF1.toFixed(3)}`)
