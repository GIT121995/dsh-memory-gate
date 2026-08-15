/**
 * 结果层测量（纯函数）—— 从「注入的 memory」与「assistant 的最终回答」算采纳度 / 成本 / 效果分。
 *
 * 这是 P1 轨迹观测仪的核心度量，先做成可单测的纯函数，离线、零模型调用。
 * 局限（诚实的）：采纳度基于词项重叠，对 fact/procedure（回答会复述内容）有效；
 * 对 preference/constraint（模型"照做"但不会复述"简洁"这个词）是弱信号，留待后续。
 */
import { extractTerms } from '../lib/index.js'

/** 粗略双语 token 估算：CJK ~1 token/字，其余 ~1 token/4 字符。 */
export function estimateTokens(text) {
  const cjk = (text.match(/[\p{Script=Han}]/gu) ?? []).length
  const other = text.replace(/[\p{Script=Han}\s]/gu, '')
  return cjk + Math.ceil(other.length / 4)
}

/** 注入 claim 的「特有词项」：claim 词项中不在 query 词项里的那部分。 */
export function distinctiveTerms(claimTerms, queryTerms) {
  const query = new Set(queryTerms)
  return claimTerms.filter((term) => !query.has(term))
}

/** 采纳度：特有词项出现在 assistant 最终回答里的比例（0~1）。 */
export function adoptionScore(distinctive, assistantText) {
  if (!distinctive.length) return 0
  const tokens = new Set(extractTerms(assistantText, 500))
  const hits = distinctive.filter((term) => tokens.has(term)).length
  return hits / distinctive.length
}

/** 效果分：采纳 + 结果质量 − 成本惩罚，输出 [-1, +1]。 */
export function effectScore({ adoption, quality, tokenCost, costWeight = 0.002, adoptionWeight = 0.6, qualityWeight = 0.4 }) {
  const costPenalty = Math.min(1, tokenCost * costWeight)
  const score = adoptionWeight * adoption + qualityWeight * quality - costPenalty
  return Math.max(-1, Math.min(1, score))
}

/** 质量信号 0~1：有正反馈为 1、无信号 0.5、有负反馈 0（先验，待真实数据校准）。 */
export function qualitySignal(feedback) {
  if (feedback === 'helped') return 1
  if (feedback === 'harmful' || feedback === 'stale' || feedback === 'conflict') return 0
  return 0.5
}
