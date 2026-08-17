import { normalizeContent } from './repository.js';
/**
 * 记忆 cue 短语：不再锚定句首（句中「下次记得…」「对了，记住…」也能触发），
 * 但仍是保守的固定短语——不做任意「记住」匹配，避免乱存。
 */
const MEMORY_CUES = [
    /(?:请)?记住[：:,，\s]*/u,
    /以后(?:请)?[：:,，\s]*/u,
    /请始终[：:,，\s]*/u,
    /我(?:的)?偏好是?[：:,，\s]*/u,
    /我喜欢[：:,，\s]*/u,
    /不要再[：:,，\s]*/u,
    /(?:please\s+)?remember(?:\s+that)?[,:\s]*/iu,
    /from now on[,:\s]*/iu,
    /i prefer[,:\s]*/iu,
    /(?:please\s+)?always[,:\s]*/iu,
    /(?:please\s+)?(?:do not|don't|never)[,:\s]*/iu,
];
/** 取 cue 之后到句末（或 500 字符）作为 claim 正文，丢弃 cue 之前的前缀。 */
function takeClaim(afterCue) {
    const end = afterCue.search(/[。！？!?;；.\n]/u);
    const sliced = end === -1 ? afterCue : afterCue.slice(0, end);
    const trimmed = normalizeContent(sliced);
    return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
}
export function extractDurableClaims(text) {
    const normalized = normalizeContent(text);
    if (normalized.length < 4 || normalized.length > 1000 || looksLikeQuestion(normalized))
        return [];
    for (const cue of MEMORY_CUES) {
        const match = cue.exec(normalized);
        if (!match || match.index === undefined)
            continue;
        const content = takeClaim(normalized.slice(match.index + match[0].length));
        if (content.length < 2)
            continue;
        const kind = classify(content, normalized);
        return [{ content, kind, tags: ['auto-extracted'] }];
    }
    return [];
}
function looksLikeQuestion(value) {
    return /[?？]\s*$/u.test(value);
}
function classify(content, original) {
    const combined = `${original} ${content}`.toLocaleLowerCase();
    if (/(偏好|喜欢|prefer|格式|风格)/u.test(combined))
        return 'preference';
    if (/(不要|禁止|必须|始终|always|never|do not|don't|must)/u.test(combined))
        return 'constraint';
    if (/(步骤|流程|先.+再|procedure|workflow)/u.test(combined))
        return 'procedure';
    if (/(警告|风险|危险|warning|risk)/u.test(combined))
        return 'warning';
    return 'fact';
}
//# sourceMappingURL=extractor.js.map