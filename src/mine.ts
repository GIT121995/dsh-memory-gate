/**
 * 日志回挖（P5）—— 从历史 session 日志里补提取实时提取器漏掉的记忆 cue。
 *
 * 实时提取器只认「句首 cue」，且宁缺毋滥；回挖用更宽的 cue（不锚定句首），
 * 但仍是保守短语，产出照旧是 heuristic 低置信、带 `mined` 标签。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import type { ClaimKind } from './contracts.js'
import { normalizeContent } from './repository.js'

export interface MinedClaim {
  content: string
  kind: ClaimKind
  tags: string[]
}

const MINE_CUES = [
  /记住[：:,，\s]*/u,
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
]

/** 从 cue 之后截到句末（或 500 字符）作为 claim 正文。 */
function takeClaim(text: string): string {
  const end = text.search(/[。！？!?;；.\n]/u)
  const sliced = end === -1 ? text : text.slice(0, end)
  const trimmed = normalizeContent(sliced)
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed
}

function classifyClaim(content: string, original: string): ClaimKind {
  const combined = `${original} ${content}`.toLocaleLowerCase()
  if (/(偏好|喜欢|prefer|格式|风格)/u.test(combined)) return 'preference'
  if (/(不要|禁止|必须|始终|always|never|do not|don't|must)/u.test(combined)) return 'constraint'
  if (/(步骤|流程|先.+再|procedure|workflow)/u.test(combined)) return 'procedure'
  if (/(警告|风险|危险|warning|risk)/u.test(combined)) return 'warning'
  return 'fact'
}

/** 从一段文本里回挖第一条记忆 cue（非锚定句首）。 */
export function mineClaims(text: string): MinedClaim[] {
  const normalized = normalizeContent(text)
  if (normalized.length < 4 || normalized.length > 2000) return []
  for (const cue of MINE_CUES) {
    const match = cue.exec(normalized)
    if (!match || match.index === undefined) continue
    const rest = normalized.slice(match.index + match[0].length)
    const content = takeClaim(rest)
    if (content.length < 2) continue
    return [{ content, kind: classifyClaim(content, normalized), tags: ['mined'] }]
  }
  return []
}

interface LogEvent {
  type?: string
  data?: { source?: { kind?: string }; content?: Array<{ text?: string }> }
}

/** 从 session 日志纯文本（jsonl）里抽取用户消息，逐条回挖。 */
export function mineSessionLog(plaintext: string): MinedClaim[] {
  const claims: MinedClaim[] = []
  for (const line of plaintext.split('\n')) {
    if (!line.trim()) continue
    let event: LogEvent | null = null
    try {
      event = JSON.parse(line) as LogEvent
    } catch {
      continue
    }
    if (!event || event.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    const text = (event.data?.content ?? []).map((part) => part?.text ?? '').join('\n')
    if (!text || text.includes('<long_term_memory>')) continue
    claims.push(...mineClaims(text))
  }
  return claims
}

export interface MineScanResult {
  claims: MinedClaim[]
  scannedFiles: number
}

/**
 * 扫描 sessionsRoot 下所有 `session.jsonl.zstd`，回挖候选记忆。
 * 全程 fail-open：任何读/解压失败都跳过，绝不抛错。
 */
export function mineSessions(sessionsRoot: string, maxSessions: number): MineScanResult {
  const claims: MinedClaim[] = []
  let scannedFiles = 0
  try {
    const workspaceDirs = readdirSync(sessionsRoot)
    for (const workspaceDir of workspaceDirs) {
      const workspacePath = join(sessionsRoot, workspaceDir)
      let sessionDirs: string[] = []
      try {
        sessionDirs = readdirSync(workspacePath)
      } catch {
        continue
      }
      for (const sessionDir of sessionDirs) {
        const file = join(workspacePath, sessionDir, 'session.jsonl.zstd')
        if (!existsSync(file)) continue
        scannedFiles += 1
        try {
          const plaintext = zstdDecompressSync(readFileSync(file)).toString('utf8')
          claims.push(...mineSessionLog(plaintext))
        } catch {
          // fail-open：损坏或无法读取的日志直接跳过
        }
        if (scannedFiles >= maxSessions) return { claims, scannedFiles }
      }
    }
  } catch {
    // sessionsRoot 不存在等情况，返回空结果
  }
  return { claims, scannedFiles }
}
