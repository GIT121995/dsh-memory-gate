export function decideAuthority(candidate, policy, now = Date.now()) {
    const { claim, belief } = candidate;
    const beliefScore = clamp(belief.alpha / Math.max(1, belief.alpha + belief.beta));
    const relevanceScore = clamp(candidate.lexicalScore);
    const ageDays = Math.max(0, now - claim.updatedAt) / 86_400_000;
    const freshnessScore = clamp(2 ** (-ageDays / policy.freshnessHalfLifeDays));
    const riskScore = clamp(baseRisk(claim.kind) + (1 - beliefScore) * 0.3 + Math.min(0.3, belief.harmfulCount * 0.15));
    const reasonCodes = [];
    if (candidate.recallChannel === 'capsule')
        reasonCodes.push('trusted_global_capsule');
    if (claim.state !== 'active') {
        reasonCodes.push('claim_not_active');
        return make('ignore');
    }
    if (claim.validUntil !== undefined && claim.validUntil <= now) {
        reasonCodes.push('claim_expired');
        return make('verify');
    }
    if (belief.harmfulCount >= policy.harmfulQuarantineThreshold) {
        reasonCodes.push('harmful_quarantine');
        return make('ignore');
    }
    if (relevanceScore < 0.12) {
        reasonCodes.push('low_relevance');
        return make('ignore');
    }
    if (freshnessScore < 0.2) {
        reasonCodes.push('stale_memory');
        return make('verify');
    }
    if (beliefScore < policy.minUseBelief)
        reasonCodes.push('belief_below_use_threshold');
    if (riskScore > policy.maxUseRisk)
        reasonCodes.push('risk_above_use_threshold');
    if (claim.origin === 'heuristic')
        reasonCodes.push('heuristic_origin');
    if (reasonCodes.includes('belief_below_use_threshold') || reasonCodes.includes('risk_above_use_threshold')) {
        return make('verify');
    }
    reasonCodes.push('authority_thresholds_passed');
    return make('use');
    function make(action) {
        return {
            claimId: claim.id,
            action,
            reasonCodes,
            beliefScore,
            relevanceScore,
            freshnessScore,
            riskScore,
        };
    }
}
function baseRisk(kind) {
    switch (kind) {
        case 'preference':
            return 0.12;
        case 'fact':
            return 0.2;
        case 'procedure':
            return 0.28;
        case 'constraint':
            return 0.34;
        case 'warning':
            return 0.4;
    }
}
function clamp(value) {
    return Math.max(0, Math.min(1, value));
}
//# sourceMappingURL=authority.js.map