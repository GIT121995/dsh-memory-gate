/**
 * Write-side supersession policy.
 *
 * Lexical overlap alone must not decide that two claims are the same
 * proposition: two conditional procedures can share a subject (and 70% of
 * their terms) while carrying different applicability conditions. This module
 * keeps the write path conservative — a claim may replace an older one only
 * when:
 *
 *   1. the new claim carries explicit replacement intent (「不再/改为/…」), or
 *   2. the two claims differ by no structured discriminators at all
 *      (identifier/path/number/literal tokens), i.e. a true paraphrase or a
 *      one-sided refinement.
 *
 * When both sides carry their own discriminators, the conditions differ and
 * both claims stay active. Lexical overlap then only nominates them for
 * read-side review instead of silently dropping one branch.
 * @module dsh-memory-gate/relations
 */
import type { ClaimOrigin } from './contracts.js';
export interface SupersedeInput {
    content: string;
    origin: ClaimOrigin;
}
export type SupersedeReason = 'explicit_replacement' | 'paraphrase' | 'refinement' | 'condition_diff' | 'info_loss' | 'origin_guard';
export interface SupersedeDecision {
    /** true = 新 claim 可以取代旧 claim；false = 两条都保持 active。 */
    supersede: boolean;
    reason: SupersedeReason;
    /** 只出现在新 claim 中的结构化判别词。 */
    onlyNew: string[];
    /** 只出现在旧 claim 中的结构化判别词。 */
    onlyOld: string[];
}
/** 新内容是否显式表达「取代旧做法」。 */
export declare function hasReplacementIntent(content: string): boolean;
/** 提取承载适用条件的结构化判别词（去重、保持出现顺序、有上限）。 */
export declare function structuredDiscriminators(content: string): string[];
/**
 * 判断新 claim 是否可以取代旧 claim。调用方仍需先满足最低词项重叠阈值；
 * 本函数只回答「命题是否同一 / 是否显式替换」。
 */
export declare function decideSupersede(newer: SupersedeInput, older: SupersedeInput): SupersedeDecision;
//# sourceMappingURL=relations.d.ts.map