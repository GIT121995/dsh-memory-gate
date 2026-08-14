export type MemoryMode = 'shadow' | 'assist' | 'enforce'
export type ClaimScope = 'session' | 'workspace' | 'global'
export type ClaimKind = 'preference' | 'constraint' | 'fact' | 'procedure' | 'warning'
export type ClaimState = 'active' | 'superseded' | 'tombstoned'
export type ClaimOrigin = 'explicit' | 'heuristic'
export type AuthorityAction = 'use' | 'verify' | 'ignore'
export type ConsumptionOutcome = 'helped' | 'harmful' | 'stale' | 'conflict' | 'unknown'

export interface Claim {
  id: string
  scope: ClaimScope
  scopeKey: string
  kind: ClaimKind
  content: string
  tags: string[]
  state: ClaimState
  origin: ClaimOrigin
  sensitivity: 'normal' | 'private'
  contentHash: string
  /** Normalized retrieval terms derived from content + tags at write time. */
  terms: string[]
  /** Terms learned from confirmed-helpful queries (feedback loop). */
  learnedTerms: string[]
  sourceSessionId?: string
  sourceEventSeq?: number
  validFrom: number
  validUntil?: number
  createdAt: number
  updatedAt: number
}

export interface NewClaim {
  scope: ClaimScope
  scopeKey: string
  kind: ClaimKind
  content: string
  tags?: string[]
  origin: ClaimOrigin
  sensitivity?: 'normal' | 'private'
  sourceSessionId?: string
  sourceEventSeq?: number
  validFrom?: number
  validUntil?: number
}

export interface Belief {
  claimId: string
  alpha: number
  beta: number
  harmfulCount: number
  updatedAt: number
}

export interface Evidence {
  id: string
  claimId: string
  kind: 'asserted' | 'helped' | 'harmful' | 'stale' | 'conflict'
  weight: number
  detail?: string
  sessionId?: string
  createdAt: number
}

export interface SearchCandidate {
  claim: Claim
  belief: Belief
  recallChannel: 'trigger' | 'capsule'
  lexicalScore: number
  freshnessScore: number
  rankScore: number
}

export interface AuthorityDecision {
  claimId: string
  action: AuthorityAction
  reasonCodes: string[]
  beliefScore: number
  relevanceScore: number
  freshnessScore: number
  riskScore: number
}

export interface RetrievalResult {
  runId: string
  query: string
  decisions: AuthorityDecision[]
  candidates: SearchCandidate[]
}

export interface MemoryStats {
  activeClaims: number
  tombstonedClaims: number
  decisions: number
  injections: number
  consumptions: number
}

export interface RememberOptions {
  scope: ClaimScope
  scopeKey: string
  kind?: ClaimKind
  tags?: string[]
  origin?: ClaimOrigin
  sourceSessionId?: string
  sourceEventSeq?: number
}
