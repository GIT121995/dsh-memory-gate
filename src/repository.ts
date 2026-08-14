import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  AuthorityDecision,
  Belief,
  Claim,
  ConsumptionOutcome,
  Evidence,
  MemoryStats,
  NewClaim,
  SearchCandidate,
} from './contracts.js'

type SqlValue = string | number | bigint | null | Uint8Array
type Row = Record<string, SqlValue>

const SCHEMA_VERSION = 1

export class MemoryRepository {
  readonly databasePath: string
  private readonly db: DatabaseSync
  private ftsAvailable = false

  constructor(databasePath: string) {
    this.databasePath = databasePath === ':memory:' ? databasePath : resolve(databasePath)
    if (this.databasePath !== ':memory:') mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
    if (this.databasePath !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  health(): { ok: boolean; schemaVersion: number; ftsAvailable: boolean } {
    const row = this.db.prepare('PRAGMA user_version').get() as Row
    return {
      ok: Number(row.user_version) === SCHEMA_VERSION,
      schemaVersion: Number(row.user_version),
      ftsAvailable: this.ftsAvailable,
    }
  }

  remember(input: NewClaim): { claim: Claim; created: boolean } {
    const content = normalizeContent(input.content)
    if (!content) throw new Error('Memory content cannot be empty')
    const contentHash = hashContent(content)
    const existing = this.db
      .prepare(
        `SELECT * FROM claims
         WHERE scope_key = ? AND content_hash = ? AND state = 'active'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(input.scopeKey, contentHash) as Row | undefined
    if (existing) return { claim: rowToClaim(existing), created: false }

    const now = Date.now()
    const claim: Claim = {
      id: `mem_${randomUUID()}`,
      scope: input.scope,
      scopeKey: input.scopeKey,
      kind: input.kind,
      content,
      tags: uniqueTags(input.tags ?? []),
      state: 'active',
      origin: input.origin,
      sensitivity: input.sensitivity ?? 'normal',
      contentHash,
      ...(input.sourceSessionId === undefined ? {} : { sourceSessionId: input.sourceSessionId }),
      ...(input.sourceEventSeq === undefined ? {} : { sourceEventSeq: input.sourceEventSeq }),
      validFrom: input.validFrom ?? now,
      ...(input.validUntil === undefined ? {} : { validUntil: input.validUntil }),
      createdAt: now,
      updatedAt: now,
    }

    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO claims (
             id, scope, scope_key, kind, content, tags_json, state, origin,
             sensitivity, content_hash, source_session_id, source_event_seq,
             valid_from, valid_until, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          claim.id,
          claim.scope,
          claim.scopeKey,
          claim.kind,
          claim.content,
          JSON.stringify(claim.tags),
          claim.state,
          claim.origin,
          claim.sensitivity,
          claim.contentHash,
          claim.sourceSessionId ?? null,
          claim.sourceEventSeq ?? null,
          claim.validFrom,
          claim.validUntil ?? null,
          claim.createdAt,
          claim.updatedAt,
        )
      const alpha = claim.origin === 'explicit' ? 6 : 4
      const beta = claim.origin === 'explicit' ? 1 : 2
      this.db
        .prepare('INSERT INTO beliefs (claim_id, alpha, beta, harmful_count, updated_at) VALUES (?, ?, ?, 0, ?)')
        .run(claim.id, alpha, beta, now)
      this.db
        .prepare('INSERT INTO evidence (id, claim_id, kind, weight, detail, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(`ev_${randomUUID()}`, claim.id, 'asserted', 1, claim.origin, claim.sourceSessionId ?? null, now)
      this.indexClaim(claim)
    })

    return { claim, created: true }
  }

  tombstone(claimId: string, scopeKeys: string[]): boolean {
    const placeholders = scopeKeys.map(() => '?').join(', ')
    if (!placeholders) return false
    let changed = false
    this.transaction(() => {
      const result = this.db
        .prepare(`UPDATE claims SET state = 'tombstoned', updated_at = ? WHERE id = ? AND scope_key IN (${placeholders}) AND state = 'active'`)
        .run(Date.now(), claimId, ...scopeKeys)
      changed = Number(result.changes) > 0
      if (changed && this.ftsAvailable) this.db.prepare('DELETE FROM claim_fts WHERE claim_id = ?').run(claimId)
    })
    return changed
  }

  getClaim(claimId: string, scopeKeys?: string[]): Claim | undefined {
    let row: Row | undefined
    if (scopeKeys?.length) {
      const placeholders = scopeKeys.map(() => '?').join(', ')
      row = this.db
        .prepare(`SELECT * FROM claims WHERE id = ? AND scope_key IN (${placeholders}) LIMIT 1`)
        .get(claimId, ...scopeKeys) as Row | undefined
    } else {
      row = this.db.prepare('SELECT * FROM claims WHERE id = ? LIMIT 1').get(claimId) as Row | undefined
    }
    return row ? rowToClaim(row) : undefined
  }

  getBelief(claimId: string): Belief | undefined {
    const row = this.db.prepare('SELECT * FROM beliefs WHERE claim_id = ?').get(claimId) as Row | undefined
    return row ? rowToBelief(row) : undefined
  }

  getEvidence(claimId: string): Evidence[] {
    const rows = this.db
      .prepare('SELECT * FROM evidence WHERE claim_id = ? ORDER BY created_at DESC')
      .all(claimId) as Row[]
    return rows.map(rowToEvidence)
  }

  search(query: string, scopeKeys: string[], limit: number): SearchCandidate[] {
    if (!scopeKeys.length || limit < 1) return []
    const placeholders = scopeKeys.map(() => '?').join(', ')
    const scanLimit = Math.min(Math.max(limit * 20, 100), 500)
    const rows = this.db
      .prepare(
        `SELECT c.*, b.alpha, b.beta, b.harmful_count, b.updated_at AS belief_updated_at
         FROM claims c JOIN beliefs b ON b.claim_id = c.id
         WHERE c.state = 'active' AND c.scope_key IN (${placeholders})
           AND c.valid_from <= ? AND (c.valid_until IS NULL OR c.valid_until > ?)
         ORDER BY c.updated_at DESC LIMIT ?`,
      )
      .all(...scopeKeys, Date.now(), Date.now(), scanLimit) as Row[]

    const ftsIds = this.searchFtsIds(query, scopeKeys, scanLimit)
    const queryTerms = terms(query)
    return rows
      .map((row) => {
        const claim = rowToClaim(row)
        const lexicalScore = lexicalSimilarity(queryTerms, claim.content, claim.tags, ftsIds.has(claim.id))
        const belief = rowToBelief(row)
        return { claim, belief, recallChannel: 'trigger' as const, lexicalScore, freshnessScore: 0, rankScore: lexicalScore }
      })
      .filter((candidate) => queryTerms.length === 0 || candidate.lexicalScore > 0)
      .sort((a, b) => b.rankScore - a.rankScore || b.claim.updatedAt - a.claim.updatedAt)
      .slice(0, limit)
  }

  capsule(scopeKeys: string[], limit: number): SearchCandidate[] {
    if (!scopeKeys.includes('global') || limit < 1) return []
    const now = Date.now()
    const rows = this.db
      .prepare(
        `SELECT c.*, b.alpha, b.beta, b.harmful_count, b.updated_at AS belief_updated_at
         FROM claims c JOIN beliefs b ON b.claim_id = c.id
         WHERE c.state = 'active' AND c.scope = 'global' AND c.scope_key = 'global'
           AND c.origin = 'explicit' AND c.kind IN ('preference', 'constraint')
           AND c.valid_from <= ? AND (c.valid_until IS NULL OR c.valid_until > ?)
         ORDER BY (b.alpha / (b.alpha + b.beta)) DESC, c.updated_at DESC
         LIMIT ?`,
      )
      .all(now, now, limit) as Row[]
    return rows.map((row) => ({
      claim: rowToClaim(row),
      belief: rowToBelief(row),
      recallChannel: 'capsule' as const,
      lexicalScore: 0.35,
      freshnessScore: 0,
      rankScore: 0.35,
    }))
  }

  listActive(scopeKeys: string[], limit: number): SearchCandidate[] {
    return this.search('', scopeKeys, limit)
  }

  recordRetrieval(query: string, sessionId: string, workspaceKey: string, candidateCount: number): string {
    const id = `run_${randomUUID()}`
    this.db
      .prepare(
        'INSERT INTO retrieval_runs (id, query_hash, session_id, workspace_key, candidate_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, hashContent(query), sessionId, workspaceKey, candidateCount, Date.now())
    return id
  }

  recordDecisions(runId: string, decisions: AuthorityDecision[]): void {
    this.transaction(() => {
      const statement = this.db.prepare(
        `INSERT INTO authority_decisions
         (id, run_id, claim_id, action, reason_codes_json, belief_score, relevance_score, freshness_score, risk_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const now = Date.now()
      for (const decision of decisions) {
        statement.run(
          `dec_${randomUUID()}`,
          runId,
          decision.claimId,
          decision.action,
          JSON.stringify(decision.reasonCodes),
          decision.beliefScore,
          decision.relevanceScore,
          decision.freshnessScore,
          decision.riskScore,
          now,
        )
      }
    })
  }

  recordInjection(runId: string, sessionId: string, mode: string, claimIds: string[], messageId: string): string {
    const id = `inj_${randomUUID()}`
    this.db
      .prepare(
        'INSERT INTO injections (id, run_id, session_id, mode, claim_ids_json, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, runId, sessionId, mode, JSON.stringify(claimIds), messageId, Date.now())
    return id
  }

  recordConsumption(claimId: string, outcome: ConsumptionOutcome, sessionId: string, detail?: string): Belief {
    const claim = this.getClaim(claimId)
    if (!claim || claim.state !== 'active') throw new Error('Active memory claim not found')
    const weights: Record<ConsumptionOutcome, { alpha: number; beta: number; harmful: number }> = {
      helped: { alpha: 1, beta: 0, harmful: 0 },
      harmful: { alpha: 0, beta: 5, harmful: 1 },
      stale: { alpha: 0, beta: 2, harmful: 0 },
      conflict: { alpha: 0, beta: 4, harmful: 0 },
      unknown: { alpha: 0, beta: 0, harmful: 0 },
    }
    const delta = weights[outcome]
    const now = Date.now()
    this.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO consumption (id, claim_id, session_id, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(`con_${randomUUID()}`, claimId, sessionId, outcome, detail ?? null, now)
      if (outcome !== 'unknown') {
        this.db
          .prepare('UPDATE beliefs SET alpha = alpha + ?, beta = beta + ?, harmful_count = harmful_count + ?, updated_at = ? WHERE claim_id = ?')
          .run(delta.alpha, delta.beta, delta.harmful, now, claimId)
        this.db
          .prepare('INSERT INTO evidence (id, claim_id, kind, weight, detail, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`ev_${randomUUID()}`, claimId, outcome, delta.alpha || delta.beta, detail ?? null, sessionId, now)
      }
    })
    const belief = this.getBelief(claimId)
    if (!belief) throw new Error('Memory belief update failed')
    return belief
  }

  pruneAudit(maxRuns: number): number {
    const excess = Math.max(0, this.countRows('retrieval_runs') - Math.max(1, Math.floor(maxRuns)))
    if (!excess) return 0
    this.transaction(() => {
      this.db.exec('CREATE TEMP TABLE IF NOT EXISTS memory_prune_runs (id TEXT PRIMARY KEY)')
      this.db.exec('DELETE FROM memory_prune_runs')
      this.db
        .prepare(
          `INSERT INTO memory_prune_runs (id)
           SELECT id FROM retrieval_runs ORDER BY created_at ASC, id ASC LIMIT ?`,
        )
        .run(excess)
      this.db.exec('DELETE FROM injections WHERE run_id IN (SELECT id FROM memory_prune_runs)')
      this.db.exec('DELETE FROM authority_decisions WHERE run_id IN (SELECT id FROM memory_prune_runs)')
      this.db.exec('DELETE FROM retrieval_runs WHERE id IN (SELECT id FROM memory_prune_runs)')
      this.db.exec('DELETE FROM memory_prune_runs')
    })
    return excess
  }

  stats(): MemoryStats {
    const claimRows = this.db.prepare('SELECT state, COUNT(*) AS count FROM claims GROUP BY state').all() as Row[]
    const byState = new Map(claimRows.map((row) => [String(row.state), Number(row.count)]))
    return {
      activeClaims: byState.get('active') ?? 0,
      tombstonedClaims: byState.get('tombstoned') ?? 0,
      decisions: this.count('authority_decisions'),
      injections: this.count('injections'),
      consumptions: this.count('consumption'),
    }
  }

  private count(table: 'authority_decisions' | 'injections' | 'consumption'): number {
    return this.countRows(table)
  }

  private countRows(table: 'retrieval_runs' | 'authority_decisions' | 'injections' | 'consumption'): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as Row
    return Number(row.count)
  }

  private searchFtsIds(query: string, scopeKeys: string[], limit: number): Set<string> {
    if (!this.ftsAvailable) return new Set()
    const ftsQuery = buildFtsQuery(query)
    if (!ftsQuery) return new Set()
    try {
      const placeholders = scopeKeys.map(() => '?').join(', ')
      const rows = this.db
        .prepare(
          `SELECT f.claim_id FROM claim_fts f JOIN claims c ON c.id = f.claim_id
           WHERE claim_fts MATCH ? AND c.scope_key IN (${placeholders}) AND c.state = 'active'
           ORDER BY bm25(claim_fts) LIMIT ?`,
        )
        .all(ftsQuery, ...scopeKeys, limit) as Row[]
      return new Set(rows.map((row) => String(row.claim_id)))
    } catch {
      return new Set()
    }
  }

  private indexClaim(claim: Claim): void {
    if (!this.ftsAvailable) return
    this.db.prepare('INSERT INTO claim_fts (claim_id, content, tags) VALUES (?, ?, ?)').run(claim.id, claim.content, claim.tags.join(' '))
  }

  private migrate(): void {
    const versionRow = this.db.prepare('PRAGMA user_version').get() as Row
    const version = Number(versionRow.user_version)
    if (version > SCHEMA_VERSION) throw new Error(`Unsupported memory schema version ${version}`)
    if (version < 1) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE claims (
            id TEXT PRIMARY KEY,
            scope TEXT NOT NULL CHECK (scope IN ('session', 'workspace', 'global')),
            scope_key TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('preference', 'constraint', 'fact', 'procedure', 'warning')),
            content TEXT NOT NULL,
            tags_json TEXT NOT NULL DEFAULT '[]',
            state TEXT NOT NULL CHECK (state IN ('active', 'superseded', 'tombstoned')),
            origin TEXT NOT NULL CHECK (origin IN ('explicit', 'heuristic')),
            sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal', 'private')),
            content_hash TEXT NOT NULL,
            source_session_id TEXT,
            source_event_seq INTEGER,
            valid_from INTEGER NOT NULL,
            valid_until INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX claims_scope_state_updated ON claims(scope_key, state, updated_at DESC);
          CREATE INDEX claims_dedupe ON claims(scope_key, content_hash, state);
          CREATE TABLE beliefs (
            claim_id TEXT PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
            alpha REAL NOT NULL,
            beta REAL NOT NULL,
            harmful_count INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE evidence (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            weight REAL NOT NULL,
            detail TEXT,
            session_id TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX evidence_claim_created ON evidence(claim_id, created_at DESC);
          CREATE TABLE retrieval_runs (
            id TEXT PRIMARY KEY,
            query_hash TEXT NOT NULL,
            session_id TEXT NOT NULL,
            workspace_key TEXT NOT NULL,
            candidate_count INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          );
          CREATE TABLE authority_decisions (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES retrieval_runs(id) ON DELETE CASCADE,
            claim_id TEXT NOT NULL REFERENCES claims(id),
            action TEXT NOT NULL CHECK (action IN ('use', 'verify', 'ignore')),
            reason_codes_json TEXT NOT NULL,
            belief_score REAL NOT NULL,
            relevance_score REAL NOT NULL,
            freshness_score REAL NOT NULL,
            risk_score REAL NOT NULL,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX decisions_run ON authority_decisions(run_id);
          CREATE TABLE injections (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES retrieval_runs(id),
            session_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            claim_ids_json TEXT NOT NULL,
            message_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          CREATE TABLE consumption (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES claims(id),
            session_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            detail TEXT,
            created_at INTEGER NOT NULL
          );
          PRAGMA user_version = 1;
        `)
      })
    }
    try {
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS claim_fts USING fts5(claim_id UNINDEXED, content, tags, tokenize='unicode61')")
      this.ftsAvailable = true
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM claim_fts').get() as Row
      if (Number(row.count) === 0) {
        this.db.exec("INSERT INTO claim_fts (claim_id, content, tags) SELECT id, content, replace(replace(tags_json, '[', ''), ']', '') FROM claims WHERE state = 'active'")
      }
    } catch {
      this.ftsAvailable = false
    }
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

export function normalizeContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function hashContent(value: string): string {
  return createHash('sha256').update(normalizeContent(value).toLocaleLowerCase()).digest('hex')
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))].slice(0, 20)
}

function terms(value: string): string[] {
  const normalized = value.toLocaleLowerCase().normalize('NFKC')
  const latin = normalized.match(/[\p{Script=Latin}\p{N}_-]{2,}/gu) ?? []
  const hanRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? []
  const han = hanRuns.flatMap((run) => {
    if (run.length <= 2) return [run]
    return Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2))
  })
  const raw = [...latin, ...han]
  const aliases = raw.flatMap((term) => recallAliases(term))
  return [...new Set([...raw, ...aliases])]
}

function lexicalSimilarity(queryTerms: string[], content: string, tags: string[], ftsHit: boolean): number {
  if (!queryTerms.length) return 0.5
  const candidateTerms = new Set(terms(`${content} ${tags.join(' ')}`))
  const matched = queryTerms.filter((term) => candidateTerms.has(term)).length
  const queryCoverage = matched / queryTerms.length
  const candidateCoverage = matched / Math.max(1, candidateTerms.size)
  const overlap = Math.max(queryCoverage, candidateCoverage)
  return Math.min(1, overlap * 0.9 + (ftsHit ? 0.1 : 0))
}

const RECALL_ALIAS_GROUPS = [
  ['简洁', '简短', '精炼', '扼要', 'concise', 'brief'],
  ['中文', '汉语', 'chinese'],
  ['回答', '回复', '答复', 'answer', 'response'],
  ['偏好', '喜欢', 'prefer', 'preference'],
  ['项目', '工程', 'project'],
  ['测试', '验证', 'test', 'verify'],
] as const

function recallAliases(term: string): string[] {
  const aliases: string[] = []
  for (let index = 0; index < RECALL_ALIAS_GROUPS.length; index += 1) {
    if ((RECALL_ALIAS_GROUPS[index] as readonly string[] | undefined)?.includes(term)) aliases.push(`recall_alias_${index}`)
  }
  return aliases
}

function buildFtsQuery(value: string): string {
  return terms(value)
    .slice(0, 12)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' OR ')
}

function rowToClaim(row: Row): Claim {
  return {
    id: String(row.id),
    scope: String(row.scope) as Claim['scope'],
    scopeKey: String(row.scope_key),
    kind: String(row.kind) as Claim['kind'],
    content: String(row.content),
    tags: JSON.parse(String(row.tags_json)) as string[],
    state: String(row.state) as Claim['state'],
    origin: String(row.origin) as Claim['origin'],
    sensitivity: String(row.sensitivity) as Claim['sensitivity'],
    contentHash: String(row.content_hash),
    ...(row.source_session_id === null || row.source_session_id === undefined ? {} : { sourceSessionId: String(row.source_session_id) }),
    ...(row.source_event_seq === null || row.source_event_seq === undefined ? {} : { sourceEventSeq: Number(row.source_event_seq) }),
    validFrom: Number(row.valid_from),
    ...(row.valid_until === null || row.valid_until === undefined ? {} : { validUntil: Number(row.valid_until) }),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function rowToBelief(row: Row): Belief {
  return {
    claimId: String(row.claim_id ?? row.id),
    alpha: Number(row.alpha),
    beta: Number(row.beta),
    harmfulCount: Number(row.harmful_count),
    updatedAt: Number(row.belief_updated_at ?? row.updated_at),
  }
}

function rowToEvidence(row: Row): Evidence {
  return {
    id: String(row.id),
    claimId: String(row.claim_id),
    kind: String(row.kind) as Evidence['kind'],
    weight: Number(row.weight),
    ...(row.detail === null || row.detail === undefined ? {} : { detail: String(row.detail) }),
    ...(row.session_id === null || row.session_id === undefined ? {} : { sessionId: String(row.session_id) }),
    createdAt: Number(row.created_at),
  }
}
