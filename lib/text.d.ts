/**
 * Retrieval-side text utilities: CJK normalization, term extraction with
 * synonym folding, and learned-term merging.
 *
 * Both the write path (claims.terms_json) and the query path run through
 * `extractTerms`, so simplified/traditional and full-width/half-width
 * variants of the same text converge on identical terms.
 * @module dsh-memory-gate/text
 */
export interface SynonymGroup {
    id: string;
    members: string[];
}
/**
 * Synonym groups folded on both the write and query paths. A term in any
 * group yields one stable alias token (`recall_alias_<id>`), so cross-
 * vocabulary matches survive index rebuilds and schema migrations.
 */
export declare const SYNONYM_GROUPS: SynonymGroup[];
/**
 * Normalize text for term extraction: NFKC (full-width → half-width,
 * compatibility forms), lower-case, and common traditional → simplified
 * conversion. Applied to both indexed content and queries.
 */
export declare function normalizeForTerms(value: string): string;
/**
 * Extract retrieval terms: Latin word runs (≥2 chars, stopwords removed),
 * Han bigrams (bigrams containing stop characters removed), plus one stable
 * alias token per matching synonym group. Order is deterministic: latin
 * terms first, then Han terms in source order.
 */
export declare function extractTerms(value: string, maxTerms?: number): string[];
/**
 * Merge terms learned from confirmed-helpful queries into a claim's learned
 * term list. Existing terms are preserved, duplicates and terms already
 * present in the write-time term set are skipped, and the result is capped.
 * @returns the merged list and the terms actually added.
 */
export declare function mergeLearnedTerms(existing: string[], incoming: string[], cap: number, baseTerms?: string[]): {
    terms: string[];
    added: string[];
};
/** Build an FTS5 OR query from quoted terms (bigrams become phrase queries). */
export declare function buildFtsQuery(value: string): string;
/**
 * 两个词项集合的重叠率：交叠词数 / 较小集合大小（0~1）。
 * 用于「相近表达视为同一条记忆」的相似去重（supersede）。
 */
export declare function termOverlap(aTerms: string[], bTerms: string[]): number;
//# sourceMappingURL=text.d.ts.map