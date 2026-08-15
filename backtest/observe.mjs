/**
 * 轨迹观测 —— 把结果层度量接到真实/合成 session 轨迹上。
 *
 * 对每个含注入的回合：query 词项 → 注入块特有词项 → 在 assistant 最终回答里量采纳度
 * → 合成效果分。支持 .jsonl 与 .jsonl.zstd（经 zstd CLI 解压）。
 *
 * 用法：node backtest/observe.mjs <session.jsonl|session.jsonl.zstd>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { extractTerms } from '../lib/index.js'
import { adoptionScore, distinctiveTerms, effectScore, estimateTokens, qualitySignal } from './measure.mjs'
import { observeSession, parseEvents } from './trajectory.mjs'

const file = process.argv[2]
if (!file) {
  console.error('用法: node backtest/observe.mjs <session.jsonl|session.jsonl.zstd>')
  process.exit(2)
}

const path = resolve(file)
let text
if (path.endsWith('.zstd')) {
  text = execFileSync('zstd', ['-dc', path], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8')
} else {
  text = readFileSync(path, 'utf8')
}

const turns = observeSession(parseEvents(text))
const rows = []
for (const turn of turns) {
  if (!turn.injections.length) continue
  const queryTerms = extractTerms(turn.query)
  const memoryText = turn.injections.flatMap((i) => i.contents ?? [i.text]).join('\n')
  const memoryTerms = extractTerms(memoryText, 500)
  const distinctive = distinctiveTerms(memoryTerms, queryTerms)
  const adoption = adoptionScore(distinctive, turn.assistantText)
  const tokenCost = estimateTokens(memoryText)
  const effect = effectScore({ adoption, quality: qualitySignal(undefined), tokenCost })
  rows.push({ turn: turn.turn, claims: turn.injections.flatMap((i) => i.claimIds).length, adoption, tokenCost, effect })
}

if (!rows.length) {
  console.log('（该轨迹中未检测到记忆注入——等 dogfood 存了记忆、有了真实注入后这里才有数据）')
} else {
  console.log('| 回合 | 注入条数 | 采纳度 | token 成本 | 效果分 |')
  console.log('|---|---|---|---|---|')
  for (const r of rows) {
    console.log(`| #${r.turn} | ${r.claims} | ${r.adoption.toFixed(2)} | ${r.tokenCost} | ${r.effect.toFixed(2)} |`)
  }
  const avgAdoption = rows.reduce((s, r) => s + r.adoption, 0) / rows.length
  const avgEffect = rows.reduce((s, r) => s + r.effect, 0) / rows.length
  console.log(`\n注入 ${rows.length} 次；平均采纳度 ${avgAdoption.toFixed(2)}；平均效果分 ${avgEffect.toFixed(2)}`)
}
