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
 * 硬案例（hard=true）单独列出、不参与 CI 门：它们记录已知短板，供研究不阻塞发版。
 * CI 门：任一非 hard 场景 gate 注入或动作判错 → 退出码 1。
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
const MIN_F1 = Number(process.env.BACKTEST_MIN_F1 ?? '0.9')

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
    const { claim: created } = svc.remember(claim.content, {
      scope: claim.scope ?? 'global',
      scopeKey: claim.scope ?? 'global',
      kind: claim.kind,
      origin: claim.origin ?? 'explicit',
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

  // 动作正确性（仅 gate）：每个 claim 的实际动作 vs 期望动作，缺失视为 ignore。
  const actionCorrect = scenario.claim_store.every((_, index) => {
    const actual = gateDecisions.find((d) => d.index === index)?.action ?? 'ignore'
    return actual === expectedAction(index)
  })

  repo.close()
  return {
    scenario,
    goldenSet,
    gateInject,
    topInject,
    randomInject,
    shadowInject,
    gateDecisions,
    actionCorrect,
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

function fmt(set) {
  return set.size === 0 ? '∅' : [...set].sort((a, b) => a - b).join(',')
}

const scenarios = loadScenarios()
const results = scenarios.map(runScenario)

// 汇总（claim 级 TP/FP/FN，跨场景累加；真负样本不计入）。
const agg = { gate: { tp: 0, fp: 0, fn: 0 }, 'top-3': { tp: 0, fp: 0, fn: 0 }, random: { tp: 0, fp: 0, fn: 0 }, shadow: { tp: 0, fp: 0, fn: 0 } }
for (const r of results) {
  for (const name of Object.keys(agg)) {
    const inject = r[`${name === 'top-3' ? 'topInject' : name === 'random' ? 'randomInject' : name === 'shadow' ? 'shadowInject' : 'gateInject'}`]
    for (const [index, claim] of r.scenario.claim_store.entries()) {
      const label = r.goldenSet.has(index)
      const predict = inject.has(index)
      if (predict && label) agg[name].tp += 1
      else if (predict && !label) agg[name].fp += 1
      else if (!predict && label) agg[name].fn += 1
    }
  }
}

const prf = (name) => {
  const { tp, fp, fn } = agg[name]
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1, tp, fp, fn }
}

const lines = []
lines.push('# gate 决策层回测报告（合成场景）')
lines.push('')
lines.push('| 场景 | 金标 | gate | top-3 | random | shadow | 动作 |')
lines.push('|---|---|---|---|---|---|---|')

let clearPass = 0
let clearTotal = 0
const hardFails = []

for (const r of results) {
  const { scenario, goldenSet, gateInject, topInject, randomInject, shadowInject, actionCorrect } = r
  const hard = scenario.golden.hard === true
  const gateOk = setsEqual(gateInject, goldenSet) && actionCorrect
  if (!hard) {
    clearTotal += 1
    if (gateOk) clearPass += 1
  } else if (!gateOk) {
    hardFails.push(scenario.scenario_id)
  }
  const mark = hard ? '⚠️' : gateOk ? '✓' : '✗'
  lines.push(
    `| ${scenario.scenario_id}${hard ? ' (hard)' : ''} | ${fmt(goldenSet)} | ${fmt(gateInject)} | ${fmt(topInject)} | ${fmt(randomInject)} | ${fmt(shadowInject)} | ${mark} |`,
  )
}

lines.push('')
lines.push(`## gate 腿：动作评分`)
const actionCorrectCount = results.filter((r) => r.actionCorrect).length
lines.push(`动作全对：${actionCorrectCount}/${results.length}（含 hard）`)
lines.push('')
lines.push('## claim 级指标（四腿对照）')
lines.push('')
lines.push('| 腿 | 精确率 | 召回率 | F1 | TP/FP/FN |')
lines.push('|---|---|---|---|---|')
for (const name of ['gate', 'top-3', 'random', 'shadow']) {
  const m = prf(name)
  lines.push(`| ${name} | ${m.precision.toFixed(2)} | ${m.recall.toFixed(2)} | ${m.f1.toFixed(2)} | ${m.tp}/${m.fp}/${m.fn} |`)
}

lines.push('')
lines.push(`## 结论`)
lines.push(`- 清晰场景通过：${clearPass}/${clearTotal}`)
if (hardFails.length) lines.push(`- 已知硬案例（不阻塞）：${hardFails.join(', ')}`)

const report = lines.join('\n')
console.log(report)

// 报告落盘（供归档与 CI 门读取）。
mkdirSync(REPORTS, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
writeFileSync(join(REPORTS, `backtest-${ts}.md`), report + '\n')

// CI 门：非 hard 场景 gate 必须全对，且 gate F1 不得低于阈值。
const gateF1 = prf('gate').f1
const pass = clearPass === clearTotal && gateF1 >= MIN_F1
if (!pass) {
  console.error(`\n[CI gate] FAILED: clear ${clearPass}/${clearTotal}, gate F1=${gateF1.toFixed(2)} < ${MIN_F1}`)
  process.exit(1)
}
console.log(`\n[CI gate] PASSED: clear ${clearPass}/${clearTotal}, gate F1=${gateF1.toFixed(2)}`)
