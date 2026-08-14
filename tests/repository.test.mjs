import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MemoryRepository } from '../lib/index.js'

test('fresh database migrates to schema v2 with FTS terms column', () => {
  const repository = new MemoryRepository(':memory:')
  try {
    const health = repository.health()
    assert.equal(health.ok, true)
    assert.equal(health.schemaVersion, 2)
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
    assert.equal(health.schemaVersion, 2)
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
