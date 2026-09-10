/**
 * 日志回挖（P5）—— 从历史 session 日志里补提取实时提取器漏掉的记忆 cue。
 *
 * 实时提取器只认「句首 cue」，且宁缺毋滥；回挖用更宽的 cue（不锚定句首），
 * 但仍是保守短语，产出照旧是 heuristic 低置信、带 `mined` 标签。
 *
 * 兼容 session 格式的分代命名：v0 是 `session.jsonl[.zstd]`，v1 起是
 * `session.v<N>.jsonl[.zstd]`（N 为小写十进制、无前导零；`v0` 标记不算规范名）。
 * 每个会话目录只读版本最高的 generation——持久化后端也是这样选择的，旧
 * generation 是迁移前的历史副本，重复读取会回挖出过期内容。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import { workspaceScopeKey } from './scope.js'

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
 * 规范 generation 文件名：v0 无版本标记，v1 起带小写 `v<N>`；两种物理编码都认。
 * 非规范名（大写、前导零、显式 `v0`、临时文件）一律不匹配。
 */
const LOG_FILENAME = /^session(?:\.v([1-9]\d*))?\.jsonl(\.zstd)?$/

/**
 * 解析规范 generation 文件名对应的格式版本。
 * @returns v0 为 `0`；`session.vN.jsonl[.zstd]` 为 `N`；非规范名返回 `undefined`。
 */
export function parseLogGeneration(filename: string): number | undefined {
  const match = LOG_FILENAME.exec(filename)
  if (!match) return undefined
  return match[1] === undefined ? 0 : Number(match[1])
}

/** 读取一个日志文件（zstd 帧或明文），失败返回 `undefined`（fail-open）。 */
function readLogText(file: string): string | undefined {
  try {
    const raw = readFileSync(file)
    return file.endsWith('.zstd') ? zstdDecompressSync(raw).toString('utf8') : raw.toString('utf8')
  } catch {
    return undefined
  }
}

/** 列出一个项目目录下每个会话的「最高 generation」日志（与持久化后端的选择一致）。 */
function selectSessionLogs(workspacePath: string): string[] {
  let sessionDirs: string[] = []
  try {
    sessionDirs = readdirSync(workspacePath)
  } catch {
    return []
  }
  const files: string[] = []
  for (const sessionDir of sessionDirs) {
    const dir = join(workspacePath, sessionDir)
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    let best: { path: string; version: number } | undefined
    for (const entry of entries) {
      const version = parseLogGeneration(entry)
      if (version === undefined) continue
      if (best === undefined || version > best.version) best = { path: join(dir, entry), version }
    }
    if (best !== undefined) files.push(best.path)
  }
  return files
}

/** 共享扫描：按项目/会话目录遍历最高 generation 日志，`accept` 决定是否回挖。 */
function scanSessionLogs(
  sessionsRoot: string,
  maxSessions: number,
  accept: (plaintext: string) => boolean,
): MineScanResult {
  const claims: MinedClaim[] = []
  let scannedFiles = 0
  try {
    for (const workspaceDir of readdirSync(sessionsRoot)) {
      for (const file of selectSessionLogs(join(sessionsRoot, workspaceDir))) {
        scannedFiles += 1
        const plaintext = readLogText(file)
        if (plaintext !== undefined && accept(plaintext)) claims.push(...mineSessionLog(plaintext))
        if (scannedFiles >= maxSessions) return { claims, scannedFiles }
      }
    }
  } catch {
    // sessionsRoot 不存在等情况，返回空结果
  }
  return { claims, scannedFiles }
}

/**
 * 扫描 sessionsRoot 下所有会话日志（每个会话取最高 generation），回挖候选记忆。
 * 全程 fail-open：任何读/解压失败都跳过，绝不抛错。
 */
export function mineSessions(sessionsRoot: string, maxSessions: number): MineScanResult {
  return scanSessionLogs(sessionsRoot, maxSessions, () => true)
}

/** 从 session 日志纯文本里读出首个 `session` 事件的 cwd 对应的 workspace 键。 */
export function sessionWorkspaceKey(plaintext: string): string | undefined {
  for (const line of plaintext.split('\n')) {
    if (!line.trim()) continue
    let event: { type?: string; cwd?: string } | null = null
    try {
      event = JSON.parse(line) as { type?: string; cwd?: string }
    } catch {
      continue
    }
    if (!event || event.type !== 'session') continue
    return workspaceScopeKey(event.cwd)
  }
  return undefined
}

/**
 * 扫描 sessionsRoot，只回挖「属于指定 workspace」的 session 日志。
 * 通过每个日志首个 session 事件的 cwd 哈希匹配 workspaceKey（方案 B：不串味）。
 */
export function mineWorkspaceSessions(sessionsRoot: string, workspaceKey: string, maxSessions: number): MineScanResult {
  return scanSessionLogs(sessionsRoot, maxSessions, (plaintext) => sessionWorkspaceKey(plaintext) === workspaceKey)
}
