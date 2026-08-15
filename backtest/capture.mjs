/**
 * 真实决策轨迹捕获 —— 把审计库（cbdc.sqlite）里已发生的「召回→决策→注入」
 * 导出成样本（schema v0），供结果层回测（P1）与人工抽查使用。
 *
 * 注意：出于隐私设计，retrieval_runs 只存 query_hash 与词项，不存查询原文，
 * 因此捕获样本的 query 是词项列表而非原文。
 *
 * 用法：node backtest/capture.mjs [path-to.sqlite] [outfile]
 */
import { readFileSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.argv[2] ?? '/home/ubuntu/.dsh/memory/cbdc.sqlite'
const outFile = process.argv[3] ?? join(ROOT, 'fixtures', 'captured', 'captured-latest.json')

const db = new DatabaseSync(dbPath, { readOnly: true })
try {
  const runs = db
    .prepare('SELECT id, query_terms_json, created_at FROM retrieval_runs ORDER BY created_at DESC LIMIT 50')
    .all()

  const samples = runs.map((run) => {
    const decisions = db
      .prepare(
        `SELECT d.claim_id, d.action, d.belief_score, d.relevance_score, d.freshness_score, d.risk_score, d.reason_codes_json
         FROM authority_decisions d WHERE d.run_id = ?`,
      )
      .all(run.id)
    const injection = db
      .prepare('SELECT claim_ids_json, mode, created_at FROM injections WHERE run_id = ? LIMIT 1')
      .get(run.id)
    const json = (s) => JSON.parse(s)
    return {
      schema: '1.0',
      source: 'captured',
      scenario_id: String(run.id),
      created_at: String(run.created_at),
      query_terms: json(run.query_terms_json),
      decisions: decisions.map((d) => ({
        claim_id: String(d.claim_id),
        action: String(d.action),
        belief: Number(d.belief_score),
        relevance: Number(d.relevance_score),
        freshness: Number(d.freshness_score),
        risk: Number(d.risk_score),
        reasons: json(d.reason_codes_json),
      })),
      injection: injection ? { claim_ids: json(injection.claim_ids_json), mode: String(injection.mode) } : null,
    }
  })

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(samples, null, 1) + '\n')
  console.log(`captured ${samples.length} runs → ${outFile}`)
  if (samples.length > 0) console.log(`sample keys: ${Object.keys(samples[0]).join(', ')}`)
} finally {
  db.close()
}
