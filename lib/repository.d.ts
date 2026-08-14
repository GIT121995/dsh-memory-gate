import type { AuthorityDecision, Belief, Claim, ConsumptionOutcome, Evidence, MemoryStats, NewClaim, SearchCandidate } from './contracts.js';
export declare class MemoryRepository {
    readonly databasePath: string;
    private readonly db;
    private ftsAvailable;
    constructor(databasePath: string);
    close(): void;
    health(): {
        ok: boolean;
        schemaVersion: number;
        ftsAvailable: boolean;
    };
    remember(input: NewClaim): {
        claim: Claim;
        created: boolean;
    };
    tombstone(claimId: string, scopeKeys: string[]): boolean;
    getClaim(claimId: string, scopeKeys?: string[]): Claim | undefined;
    getBelief(claimId: string): Belief | undefined;
    getEvidence(claimId: string): Evidence[];
    search(query: string, scopeKeys: string[], limit: number): SearchCandidate[];
    capsule(scopeKeys: string[], limit: number): SearchCandidate[];
    listActive(scopeKeys: string[], limit: number): SearchCandidate[];
    recordRetrieval(query: string, sessionId: string, workspaceKey: string, candidateCount: number): string;
    recordDecisions(runId: string, decisions: AuthorityDecision[]): void;
    recordInjection(runId: string, sessionId: string, mode: string, claimIds: string[], messageId: string): string;
    /** Most recent injection for a session, for the numbered feedback flow. */
    latestInjection(sessionId: string): {
        id: string;
        claimIds: string[];
        createdAt: number;
    } | undefined;
    recordConsumption(claimId: string, outcome: ConsumptionOutcome, sessionId: string, detail?: string): Belief;
    /**
     * Feedback loop: a claim marked `helped` inherits the term set of recent
     * retrieval runs it was injected into, so future paraphrases of those
     * queries match. Only normalized terms are stored — never raw query text.
     */
    private learnFromFeedback;
    private reindexClaim;
    pruneAudit(maxRuns: number): number;
    stats(): MemoryStats;
    private count;
    private countRows;
    private searchFtsIds;
    private indexClaim;
    private migrate;
    /**
     * Schema v2: write-time trigger terms, learned feedback terms, and query
     * term capture. Existing rows are backfilled from content + tags, and the
     * FTS index is rebuilt with the extra `terms` column.
     */
    private upgradeToV2;
    private ensureFts;
    private transaction;
}
export declare function normalizeContent(value: string): string;
export declare function hashContent(value: string): string;
//# sourceMappingURL=repository.d.ts.map