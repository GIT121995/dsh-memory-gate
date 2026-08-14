import type { AuthorityDecision, SearchCandidate } from './contracts.js';
export interface AuthorityPolicy {
    minUseBelief: number;
    maxUseRisk: number;
    harmfulQuarantineThreshold: number;
    freshnessHalfLifeDays: number;
}
export declare function decideAuthority(candidate: SearchCandidate, policy: AuthorityPolicy, now?: number): AuthorityDecision;
//# sourceMappingURL=authority.d.ts.map