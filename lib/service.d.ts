import type { Config } from './config.js';
import type { Claim, ClaimKind, ClaimScope, ConsumptionOutcome, MemoryMode, RememberOptions, RetrievalResult, SearchCandidate } from './contracts.js';
import { MemoryRepository } from './repository.js';
export interface RecallContext {
    query: string;
    sessionId: string;
    workspaceKey?: string;
    sessionScopeKey: string;
}
export interface RecallInjection {
    runId: string;
    text: string;
    claimIds: string[];
}
export declare class MemoryService {
    readonly repository: MemoryRepository;
    readonly config: Config;
    private modeValue;
    private retrievalsSincePrune;
    private injectionHistory;
    private degraded;
    private degradeReason;
    private degradeReport;
    constructor(repository: MemoryRepository, config: Config);
    /** 滚动窗口（默认 20 回合）内已注入的记忆字符总数。 */
    private recentInjectionChars;
    private trackInjection;
    get mode(): MemoryMode;
    setMode(mode: MemoryMode): void;
    /** L3 自我诊断状态：是否已自动降级、原因、以及关键指标。 */
    get healthState(): {
        degraded: boolean;
        reason: string;
        negativeRate?: number;
        samples?: number;
    };
    /**
     * 健康检查：最近反馈里负反馈（harmful/stale/conflict）占比过高 → 自动降级 shadow。
     * 样本不足不下结论（避免小样本误杀）；用户 `/memory mode` 可手动恢复，恢复后重新评估。
     */
    checkHealth(): void;
    remember(content: string, options: RememberOptions): {
        claim: Claim;
        created: boolean;
    };
    extractAndRemember(text: string, context: {
        sessionId: string;
        sessionScopeKey: string;
        workspaceKey?: string;
        sourceEventSeq?: number;
    }): Claim[];
    retrieve(context: RecallContext): RetrievalResult;
    prepareRecall(context: RecallContext): RecallInjection | undefined;
    search(query: string, scopeKeys: string[], limit?: number): SearchCandidate[];
    list(scopeKeys: string[], limit?: number): SearchCandidate[];
    forget(claimId: string, scopeKeys: string[]): boolean;
    feedback(claimId: string, outcome: ConsumptionOutcome, sessionId: string, detail?: string): import("./contracts.js").Belief;
    latestInjection(sessionId: string): {
        id: string;
        claimIds: string[];
        createdAt: number;
    } | undefined;
}
export declare function parseClaimKind(value: string | undefined): ClaimKind | undefined;
export declare function parseClaimScope(value: string | undefined): ClaimScope | undefined;
//# sourceMappingURL=service.d.ts.map