import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

import { mineClaims, mineSessionLog, mineWorkspaceSessions, sessionWorkspaceKey, workspaceScopeKey, MemoryService, MemoryRepository } from '../lib/index.js'

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

test('sessionWorkspaceKey 从 session 事件读 cwd 算 workspace 键', () => {
  const key = sessionWorkspaceKey('{"type":"session","cwd":"/proj/a"}\n')
  assert.ok(key)
  assert.equal(key, workspaceScopeKey('/proj/a'))
  assert.equal(sessionWorkspaceKey('{"type":"turn/start"}\n'), undefined)
})

function writeSession(sessionsRoot, workspaceDir, sessionDir, cwd, userText) {
  const dir = join(sessionsRoot, workspaceDir, sessionDir)
  mkdirSync(dir, { recursive: true })
  const jsonl = [
    JSON.stringify({ type: 'session', cwd }),
    JSON.stringify({ type: 'user/message', data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' } } }),
  ].join('\n')
  writeFileSync(join(dir, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(jsonl)))
}

test('mineWorkspaceSessions 只回挖指定 workspace 的日志', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-ws-'))
  writeSession(root, 'wsA', 's1', '/proj/a', '记住 项目A用pnpm构建')
  writeSession(root, 'wsB', 's2', '/proj/b', '记住 项目B用make构建')
  const result = mineWorkspaceSessions(root, workspaceScopeKey('/proj/a'), 10)
  assert.equal(result.claims.length, 1)
  assert.ok(result.claims[0].content.includes('项目A'))
  assert.ok(!result.claims[0].content.includes('项目B'))
})

test('mineWorkspaceOnce 每会话只挖一次、挖进 workspace 作用域', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-once-'))
  mkdirSync(join(root, 'memory'), { recursive: true })
  writeSession(join(root, 'sessions'), 'wsA', 's1', '/proj/a', '记住 项目A用pnpm构建')

  const config = {
    mode: 'assist', automaticExtraction: true, candidateLimit: 16, capsuleLimit: 2,
    injectionLimit: 3, maxInjectionChars: 1200, auditRetentionRuns: 5000,
    minUseBelief: 0.7, maxUseRisk: 0.45, harmfulQuarantineThreshold: 2, freshnessHalfLifeDays: 180,
    autoMineWorkspace: true, mineMaxSessions: 20,
    databasePath: join(root, 'memory', 'cbdc.sqlite'),
  }
  const repo = new MemoryRepository(config.databasePath)
  const svc = new MemoryService(repo, config)

  const first = svc.mineWorkspaceOnce('sess-1', '/proj/a')
  assert.equal(first.added, 1, '首次应挖到 1 条')
  const second = svc.mineWorkspaceOnce('sess-1', '/proj/a')
  assert.equal(second.added, 0, '同一会话第二次应跳过')
  const other = svc.mineWorkspaceOnce('sess-2', '/elsewhere')
  assert.equal(other.added, 0, '不匹配的 workspace 应挖不到')

  const active = svc.list(['workspace:' + workspaceScopeKey('/proj/a').split(':')[1], 'global'], 10)
  assert.ok(active.some((c) => c.claim.content.includes('项目A')), '挖到的记忆应进 workspace 作用域')
  repo.close()
})
