import type { ClaimKind } from './contracts.js'
import { normalizeContent } from './repository.js'

export interface ExtractedClaim {
  content: string
  kind: ClaimKind
  tags: string[]
}

const MEMORY_CUES = [
  /^(?:请)?记住[：,:，\s]*/u,
  /^以后(?:请)?[：,:，\s]*/u,
  /^请始终[：,:，\s]*/u,
  /^我(?:的)?偏好是[：,:，\s]*/u,
  /^我喜欢[：,:，\s]*/u,
  /^不要再[：,:，\s]*/u,
  /^(?:please\s+)?remember(?:\s+that)?[,:\s]*/iu,
  /^from now on[,:\s]*/iu,
  /^i prefer[,:\s]*/iu,
  /^(?:please\s+)?always[,:\s]*/iu,
  /^(?:please\s+)?(?:do not|don't|never)[,:\s]*/iu,
]

export function extractDurableClaims(text: string): ExtractedClaim[] {
  const normalized = normalizeContent(text)
  if (normalized.length < 4 || normalized.length > 1000 || looksLikeQuestion(normalized)) return []
  const cue = MEMORY_CUES.find((pattern) => pattern.test(normalized))
  if (!cue) return []
  const stripped = normalizeContent(normalized.replace(cue, ''))
  if (stripped.length < 2) return []
  const content = stripped.length > 500 ? stripped.slice(0, 500) : stripped
  const kind = classify(content, normalized)
  return [{ content, kind, tags: ['auto-extracted'] }]
}

function looksLikeQuestion(value: string): boolean {
  return /[?？]\s*$/u.test(value)
}

function classify(content: string, original: string): ClaimKind {
  const combined = `${original} ${content}`.toLocaleLowerCase()
  if (/(偏好|喜欢|prefer|格式|风格)/u.test(combined)) return 'preference'
  if (/(不要|禁止|必须|始终|always|never|do not|don't|must)/u.test(combined)) return 'constraint'
  if (/(步骤|流程|先.+再|procedure|workflow)/u.test(combined)) return 'procedure'
  if (/(警告|风险|危险|warning|risk)/u.test(combined)) return 'warning'
  return 'fact'
}
