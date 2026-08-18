import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MemoryRepository, MemoryService } from '../lib/index.js'

const TEST_CONFIG = {
  mode: 'assist', automaticExtraction: true, candidateLimit: 16, capsuleLimit: 2,
  injectionLimit: 3, maxInjectionChars: 1200, auditRetentionRuns: 5000,
  minUseBelief: 0.7, maxUseRisk: 0.45, harmfulQuarantineThreshold: 2, freshnessHalfLifeDays: 180,
}

test('fresh database migrates to schema v3 with FTS terms column', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const health = repository.health()
    assert.equal(health.ok, true)
    assert.equal(health.schemaVersion, 3)
    assert.equal(health.ftsAvailable, true)
  } finally {
    repository.close()
  }
})

test('simplified query finds traditional + full-width content', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    repository.remember({
      scope: 'session',
      scopeKey: 's1',
      kind: 'preference',
      content: '回覆請用簡潔的漢語，設定用全形括號（ＡＢＣ）',
      origin: 'explicit',
    })
    const results = repository.search('回复请用简洁的中文', ['s1'], 5)
    assert.ok(results.length > 0)
    assert.ok(results[0].lexicalScore > 0)
  } finally {
    repository.close()
  }
})

test('synonym group folds cross-vocabulary queries', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    repository.remember({
      scope: 'session',
      scopeKey: 's1',
      kind: 'preference',
      content: '偏好简洁中文回答',
      origin: 'explicit',
    })
    const results = repository.search('我更喜欢简短的答复', ['s1'], 5)
    assert.ok(results.length > 0)
    assert.ok(results[0].lexicalScore > 0)
  } finally {
    repository.close()
  }
})

test('helped feedback attaches query terms and future paraphrases match', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const { claim } = repository.remember({
      scope: 'session',
      scopeKey: 's1',
      kind: 'procedure',
      content: '部署流程是先测试再上线',
      origin: 'explicit',
    })
    assert.equal(claim.learnedTerms.length, 0)

    const runId = repository.recordRetrieval('发布步骤是什么', 'sess', 'ws', 1)
    repository.recordInjection(runId, 'sess', 'assist', [claim.id], 'msg_1')
    repository.recordConsumption(claim.id, 'helped', 'sess')

    const updated = repository.getClaim(claim.id)
    assert.ok(updated.learnedTerms.length > 0, `expected learned terms, got none`)

    // "发布" is not in the write-time terms of the content ("上线" is); the
    // learned term must make this new paraphrase hit.
    const results = repository.search('发布相关的内容', ['s1'], 5)
    assert.ok(results.length > 0)
    assert.ok(results[0].claim.id === claim.id)
  } finally {
    repository.close()
  }
})

test('prepareRecall labels injected claims with #n for feedback', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const service = new MemoryService(repository, TEST_CONFIG)
    service.remember('用户偏好簡潔中文回答', { scope: 'global', scopeKey: 'global', kind: 'preference' })
    const recall = service.prepareRecall({ query: '请用简短的中文答复我', sessionId: 's1', sessionScopeKey: 's1' })
    assert.ok(recall, 'expected an injection')
    assert.match(recall.text, /\[USE #1 /)
  } finally {
    repository.close()
  }
})

test('latestInjection returns the most recent injection for numbered feedback', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const { claim } = repository.remember({
      scope: 'session',
      scopeKey: 's1',
      kind: 'fact',
      content: '编号反馈测试',
      origin: 'explicit',
    })
    const runId = repository.recordRetrieval('查询', 'sess', 'ws', 1)
    repository.recordInjection(runId, 'sess', 'assist', [claim.id], 'msg_1')
    const latest = repository.latestInjection('sess')
    assert.ok(latest)
    assert.deepEqual(latest.claimIds, [claim.id])
    assert.equal(repository.latestInjection('other-session'), undefined)
  } finally {
    repository.close()
  }
})

test('v1 database upgrades in place with backfilled terms', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'memory-gate-v1-'))
  const file = join(dir, 'v1.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE claims (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL,
      origin TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      source_session_id TEXT,
      source_event_seq INTEGER,
      valid_from INTEGER NOT NULL,
      valid_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE retrieval_runs (
      id TEXT PRIMARY KEY,
      query_hash TEXT NOT NULL,
      session_id TEXT NOT NULL,
      workspace_key TEXT NOT NULL,
      candidate_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE claim_fts USING fts5(claim_id UNINDEXED, content, tags, tokenize='unicode61');
    CREATE TABLE beliefs (
      claim_id TEXT PRIMARY KEY,
      alpha REAL NOT NULL,
      beta REAL NOT NULL,
      harmful_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      weight REAL NOT NULL,
      detail TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO claims (id, scope, scope_key, kind, content, tags_json, state, origin, sensitivity, content_hash, valid_from, created_at, updated_at)
      VALUES ('mem_legacy', 'session', 's1', 'preference', '偏好簡潔中文', '["legacy"]', 'active', 'explicit', 'normal', 'hash', 1, 1, 1);
    INSERT INTO beliefs (claim_id, alpha, beta, updated_at) VALUES ('mem_legacy', 6, 1, 1);
    INSERT INTO claim_fts (claim_id, content, tags) VALUES ('mem_legacy', '偏好簡潔中文', 'legacy');
    PRAGMA user_version = 1;
  `)
  db.close()

  const repository = new MemoryRepository(file)
  try {
    const health = repository.health()
    assert.equal(health.ok, true)
    assert.equal(health.schemaVersion, 3)
    const legacy = repository.getClaim('mem_legacy')
    assert.ok(legacy)
    assert.ok(legacy.terms.includes('偏好'), `expected backfilled terms, got: ${legacy.terms.join(',')}`)
    // Simplified query must find the traditionally-written legacy claim.
    const results = repository.search('偏好简洁中文', ['s1'], 5)
    assert.ok(results.length > 0)
    assert.equal(results[0].claim.id, 'mem_legacy')
  } finally {
    repository.close()
  }
})

test('相似去重：60% 重叠 → 旧 claim superseded、新 claim 记 supersedes', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const a = repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: '项目代码位于 /home/ubuntu/dsh 目录', origin: 'explicit' }).claim
    const b = repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: '项目代码位于 /home/ubuntu/dsh 文件夹', origin: 'explicit' }).claim
    assert.equal(b.supersedes, a.id, '新 claim 应引用被取代的旧 claim')
    assert.equal(repository.getClaim(a.id).state, 'superseded')
    assert.equal(repository.getClaim(b.id).state, 'active')
    // 检索只返回新 claim
    const results = repository.search('项目目录', ['s1'], 5)
    assert.ok(results.every((c) => c.claim.id !== a.id))
  } finally {
    repository.close()
  }
})

test('consolidate 在已去重库上是幂等空操作', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const a = repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: '项目代码位于 /home/ubuntu/dsh 目录', origin: 'explicit' }).claim
    const b = repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: '项目代码位于 /home/ubuntu/dsh 文件夹', origin: 'explicit' }).claim
    // 写入时 b 已把 a supersede 掉，consolidate 应无事可做、不报错
    const merged = repository.consolidate()
    assert.equal(merged, 0)
    assert.equal(repository.getClaim(a.id).state, 'superseded')
    assert.equal(repository.getClaim(b.id).state, 'active')
  } finally {
    repository.close()
  }
})

test('bugfix：FTS 命中的旧记忆（超 scanLimit）也能召回', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const relevant = repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: '用户偏好中文回答', origin: 'explicit' }).claim
    for (let i = 0; i < 100; i += 1) {
      repository.remember({ scope: 'session', scopeKey: 's1', kind: 'fact', content: `filler_${i}`, origin: 'explicit' })
    }
    const results = repository.search('中文回答', ['s1'], 5)
    assert.ok(results.some((c) => c.claim.id === relevant.id), '旧但相关的记忆应被 FTS 召回')
  } finally {
    repository.close()
  }
})
