import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideSupersede, hasReplacementIntent, structuredDiscriminators } from '../lib/index.js'

// 报告案例：两条都有效的 SQLite WAL 恢复规则，词项重叠 0.70。
const RULE_BEGIN =
  'For SQLite WAL reservations using stock and request_id, recover SQLITE_BUSY at BEGIN IMMEDIATE by waiting within the busy_timeout budget; retry BEGIN after the competing writer commits.'
const RULE_UPDATE =
  'For SQLite WAL reservations using stock and request_id, recover SQLITE_BUSY_SNAPSHOT at UPDATE by rolling back the read transaction; retry BEGIN and re-read stock after the competing writer commits.'

test('hasReplacementIntent recognizes zh/en replacement cues only', () => {
  assert.equal(hasReplacementIntent('部署不再用 pm2，改为 systemd'), true)
  assert.equal(hasReplacementIntent('use systemd instead of pm2'), true)
  assert.equal(hasReplacementIntent('the replacement strategy is documented'), false)
  assert.equal(hasReplacementIntent('recover SQLITE_BUSY at BEGIN IMMEDIATE'), false)
})

test('structuredDiscriminators keeps identifiers, paths, numbers and literals', () => {
  const tokens = structuredDiscriminators('在 /home/ubuntu/dsh 用 busy_timeout=5000 重试 3 次（"wal" 模式）')
  assert.ok(tokens.includes('busy_timeout'))
  assert.ok(tokens.includes('/home/ubuntu/dsh'))
  assert.ok(tokens.includes('5000'))
  assert.ok(tokens.includes('3'))
  assert.ok(tokens.includes('"wal"'))
})

test('conditional branches coexist (reported case)', () => {
  const verdict = decideSupersede(
    { content: RULE_UPDATE, origin: 'explicit' },
    { content: RULE_BEGIN, origin: 'explicit' },
  )
  assert.equal(verdict.supersede, false)
  assert.equal(verdict.reason, 'condition_diff')
  assert.ok(verdict.onlyOld.includes('busy_timeout'))
  assert.ok(verdict.onlyNew.includes('sqlite_busy_snapshot'))
})

test('true paraphrase supersedes', () => {
  const verdict = decideSupersede(
    { content: '项目代码位于 /home/ubuntu/dsh 文件夹', origin: 'explicit' },
    { content: '项目代码位于 /home/ubuntu/dsh 目录', origin: 'explicit' },
  )
  assert.equal(verdict.supersede, true)
  assert.equal(verdict.reason, 'paraphrase')
})

test('one-sided added condition is a refinement and may supersede', () => {
  const verdict = decideSupersede(
    { content: 'recover SQLITE_BUSY at BEGIN IMMEDIATE by waiting within the busy_timeout budget', origin: 'explicit' },
    { content: 'recover SQLITE_BUSY at BEGIN IMMEDIATE', origin: 'explicit' },
  )
  assert.equal(verdict.supersede, true)
  assert.equal(verdict.reason, 'refinement')
})

test('dropping an old discriminator is information loss and holds', () => {
  const verdict = decideSupersede(
    { content: 'recover SQLITE_BUSY at BEGIN IMMEDIATE', origin: 'explicit' },
    { content: 'recover SQLITE_BUSY at BEGIN IMMEDIATE by waiting within the busy_timeout budget', origin: 'explicit' },
  )
  assert.equal(verdict.supersede, false)
  assert.equal(verdict.reason, 'info_loss')
})

test('explicit replacement intent supersedes even with different discriminators', () => {
  const verdict = decideSupersede(
    { content: '部署不再用 pm2，改为 systemd 管理进程', origin: 'explicit' },
    { content: '部署用 pm2 管理进程', origin: 'explicit' },
  )
  assert.equal(verdict.supersede, true)
  assert.equal(verdict.reason, 'explicit_replacement')
})

test('heuristic claim never supersedes an explicit one', () => {
  const verdict = decideSupersede(
    { content: '部署不再用 pm2，改为 systemd 管理进程', origin: 'heuristic' },
    { content: '部署禁止使用 pm2 管理进程', origin: 'explicit' },
  )
  assert.equal(verdict.supersede, false)
  assert.equal(verdict.reason, 'origin_guard')
})
