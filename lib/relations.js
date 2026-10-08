import { normalizeForTerms } from './text.js';
/** 显式替换意图：用户/文档明确表达「旧做法作废、改用新做法」。 */
const REPLACEMENT_INTENT = /(?:不再|改为|改用|换成|替代|取代|替换|废除|作废|弃用)|(?:instead\s+of)|(?:no\s+longer)|(?:\breplace(?:s|d)?\b)|(?:\bswitch(?:ed|ing)?\s+to\b)|(?:\bsupersed(?:e|es|ed)\b)|(?:\bdeprecat(?:e|ed|es|ing)\b)/u;
/**
 * 结构化判别词：通常承载「适用条件」而非文风差异。
 * 顺序有意义——引号字面量/路径优先，避免被标识符规则切碎。
 */
const STRUCTURED_TOKEN = /(?:`[^`]{2,}`|"[^"]{2,}"|'[^']{2,}')|(?:\/[a-z0-9._\-/]{3,})|(?:[a-z0-9]+[_-][a-z0-9_\-]+)|(?:[a-z]+\d[a-z0-9]*)|(?:\d+(?:\.[a-z0-9]+)*)/gu;
const MAX_DISCRIMINATORS = 32;
/** 新内容是否显式表达「取代旧做法」。 */
export function hasReplacementIntent(content) {
    return REPLACEMENT_INTENT.test(normalizeForTerms(content));
}
/** 提取承载适用条件的结构化判别词（去重、保持出现顺序、有上限）。 */
export function structuredDiscriminators(content) {
    const normalized = normalizeForTerms(content);
    const seen = new Set();
    const output = [];
    for (const match of normalized.matchAll(STRUCTURED_TOKEN)) {
        const token = match[0];
        if (seen.has(token))
            continue;
        seen.add(token);
        output.push(token);
        if (output.length >= MAX_DISCRIMINATORS)
            break;
    }
    return output;
}
/**
 * 判断新 claim 是否可以取代旧 claim。调用方仍需先满足最低词项重叠阈值；
 * 本函数只回答「命题是否同一 / 是否显式替换」。
 */
export function decideSupersede(newer, older) {
    const newDiscriminators = structuredDiscriminators(newer.content);
    const oldDiscriminators = structuredDiscriminators(older.content);
    const newerSet = new Set(newDiscriminators);
    const olderSet = new Set(oldDiscriminators);
    const onlyNew = newDiscriminators.filter((token) => !olderSet.has(token));
    const onlyOld = oldDiscriminators.filter((token) => !newerSet.has(token));
    // 自动挖掘的低置信记忆不得静默顶掉用户显式记忆。
    if (newer.origin === 'heuristic' && older.origin === 'explicit') {
        return { supersede: false, reason: 'origin_guard', onlyNew, onlyOld };
    }
    if (hasReplacementIntent(newer.content)) {
        return { supersede: true, reason: 'explicit_replacement', onlyNew, onlyOld };
    }
    // 两侧各有自己的判别词 → 适用条件不同（如 BEGIN IMMEDIATE vs UPDATE），并存。
    if (onlyNew.length > 0 && onlyOld.length > 0) {
        return { supersede: false, reason: 'condition_diff', onlyNew, onlyOld };
    }
    // 旧 claim 独有判别词而新 claim 没有 → 取代会丢失信息，并存。
    if (onlyOld.length > 0) {
        return { supersede: false, reason: 'info_loss', onlyNew, onlyOld };
    }
    // 纯同义改写，或新 claim 单侧补充了条件/参数（更具体）。
    return {
        supersede: true,
        reason: onlyNew.length > 0 ? 'refinement' : 'paraphrase',
        onlyNew,
        onlyOld,
    };
}
//# sourceMappingURL=relations.js.map