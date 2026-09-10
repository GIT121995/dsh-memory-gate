import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

import { mineClaims, mineSessionLog, mineSessions, mineWorkspaceSessions, parseLogGeneration, sessionWorkspaceKey, workspaceScopeKey, MemoryService, MemoryRepository } from '../lib/index.js'

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

function writeLog(root, workspaceDir, sessionDir, filename, events) {
  const dir = join(root, workspaceDir, sessionDir)
  mkdirSync(dir, { recursive: true })
  const jsonl = events.map((event) => JSON.stringify(event)).join('\n')
  const bytes = Buffer.from(jsonl)
  writeFileSync(join(dir, filename), filename.endsWith('.zstd') ? zstdCompressSync(bytes) : bytes)
}

function writeSession(sessionsRoot, workspaceDir, sessionDir, cwd, userText) {
  writeLog(sessionsRoot, workspaceDir, sessionDir, 'session.jsonl.zstd', [
    { type: 'session', cwd },
    { type: 'user/message', data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' } } },
  ])
}

/** 新版 harness（0.1.5+）的 V3 日志：文件名带 generation、header 多两个字段。 */
function writeV3Session(sessionsRoot, workspaceDir, sessionDir, cwd, userText) {
  writeLog(sessionsRoot, workspaceDir, sessionDir, 'session.v3.jsonl.zstd', [
    { type: 'session', version: 3, id: sessionDir, createdAt: 1, cwd, isSeeded: false, delegationDepth: 0 },
    { type: 'user/message', data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' }, role: 'user', id: 'x' } },
  ])
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

test('parseLogGeneration 只认规范 generation 文件名', () => {
  assert.equal(parseLogGeneration('session.jsonl.zstd'), 0)
  assert.equal(parseLogGeneration('session.jsonl'), 0)
  assert.equal(parseLogGeneration('session.v3.jsonl.zstd'), 3)
  assert.equal(parseLogGeneration('session.v12.jsonl'), 12)
  for (const bad of [
    'session.v0.jsonl.zstd', // 显式 v0 标记不是规范名
    'session.v01.jsonl.zstd', // 前导零
    'session.V3.jsonl.zstd', // 大写
    'session.v3.jsonl.zstd.tmp', // 临时文件
    'session.jsonl.zstd.bak',
    'session.lock',
    'other.v3.jsonl.zstd',
  ]) {
    assert.equal(parseLogGeneration(bad), undefined, `${bad} 不应被认作规范 generation`)
  }
})

test('mineSessions 回挖 V3 日志（session.v3.jsonl.zstd）', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-v3-'))
  writeV3Session(root, 'wsA', 's1', '/proj/a', '记住 项目A用pnpm构建')
  const result = mineSessions(root, 10)
  assert.equal(result.scannedFiles, 1)
  assert.equal(result.claims.length, 1)
  assert.ok(result.claims[0].content.includes('项目A'))
})

test('mineSessions 每个会话只读最高 generation，不回挖迁移前的旧副本', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-gen-'))
  writeSession(root, 'wsA', 's1', '/proj/a', '记住 旧副本里的过期记忆')
  writeV3Session(root, 'wsA', 's1', '/proj/a', '记住 迁移后的最新记忆')
  const result = mineSessions(root, 10)
  assert.equal(result.scannedFiles, 1, '每个会话只应被扫一次')
  assert.equal(result.claims.length, 1)
  assert.ok(result.claims[0].content.includes('最新记忆'))
  assert.ok(!result.claims[0].content.includes('过期记忆'))
})

test('mineSessions 支持 compression:none 的明文 generation', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-plain-'))
  writeLog(root, 'wsA', 's1', 'session.v3.jsonl', [
    { type: 'session', version: 3, cwd: '/proj/a', isSeeded: false },
    { type: 'user/message', data: { content: [{ type: 'text', text: '以后请始终用中文回答' }], source: { kind: 'user' } } },
  ])
  const result = mineSessions(root, 10)
  assert.equal(result.scannedFiles, 1)
  assert.equal(result.claims.length, 1)
  assert.ok(result.claims[0].content.includes('中文回答'))
})

test('mineWorkspaceSessions 用 V3 header 的 cwd 匹配 workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-v3-ws-'))
  writeV3Session(root, 'wsA', 's1', '/proj/a', '记住 项目A用pnpm构建')
  writeV3Session(root, 'wsB', 's2', '/proj/b', '记住 项目B用make构建')
  const result = mineWorkspaceSessions(root, workspaceScopeKey('/proj/a'), 10)
  assert.equal(result.claims.length, 1)
  assert.ok(result.claims[0].content.includes('项目A'))
  assert.ok(!result.claims[0].content.includes('项目B'))
})

test('mineSessions 跳过非规范文件名与损坏日志（fail-open）', () => {
  const root = mkdtempSync(join(tmpdir(), 'mine-bad-'))
  writeLog(root, 'wsA', 's1', 'session.v0.jsonl.zstd', [
    { type: 'session', cwd: '/proj/a' },
    { type: 'user/message', data: { content: [{ type: 'text', text: '记住 不应被读到' }], source: { kind: 'user' } } },
  ])
  const broken = join(root, 'wsA', 's2')
  mkdirSync(broken, { recursive: true })
  writeFileSync(join(broken, 'session.v3.jsonl.zstd'), Buffer.from('not a zstd frame'))
  const result = mineSessions(root, 10)
  assert.equal(result.scannedFiles, 1, '非规范名不计入，损坏的规范文件计入一次扫描')
  assert.equal(result.claims.length, 0)
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
