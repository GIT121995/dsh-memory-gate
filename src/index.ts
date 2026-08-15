import type { Context } from '@deepseek-ai/cordis'

import { registerUnavailableMemoryCommand } from './commands.js'
import { Config, type Config as MemoryConfig, validateConfig } from './config.js'
import { attachHarness } from './harness.js'
import { MemoryRepository } from './repository.js'
import { MemoryService } from './service.js'

export const name = 'dsh-memory-gate'
export const inject = ['commands']
export { Config }

export function apply(ctx: Context, config: MemoryConfig): void {
  const resolved = validateConfig(config)
  let repository: MemoryRepository
  try {
    repository = new MemoryRepository(resolved.databasePath)
  } catch (cause) {
    ctx.logger('memory-gate').error(
      'memory store unavailable; continuing without memory: %s',
      cause instanceof Error ? cause.message : String(cause),
    )
    ctx.effect(() => registerUnavailableMemoryCommand(ctx.commands), 'memory-gate: unavailable command')
    return
  }
  try {
    repository.pruneAudit(resolved.auditRetentionRuns)
  } catch (cause) {
    ctx.logger('memory-gate').warn(
      'memory audit pruning omitted: %s',
      cause instanceof Error ? cause.message : String(cause),
    )
  }
  const service = new MemoryService(repository, resolved)
  ctx.effect(
    () => () => {
      try {
        repository.close()
      } catch (cause) {
        ctx.logger('memory-gate').warn('memory database close failed: %s', cause instanceof Error ? cause.message : String(cause))
      }
    },
    'memory-gate: database',
  )
  attachHarness(ctx, service)
}

export type * from './contracts.js'
export { decideAuthority } from './authority.js'
export { extractDurableClaims } from './extractor.js'
export { injectRecall, observeSessionEvent } from './harness.js'
export { inspectForSecrets, redactForLog } from './redaction.js'
export { MemoryRepository } from './repository.js'
export { sessionScopeKey, workspaceScopeKey } from './scope.js'
export { MemoryService } from './service.js'
export { extractTerms, mergeLearnedTerms, normalizeForTerms, SYNONYM_GROUPS } from './text.js'
export { mineClaims, mineSessionLog, mineSessions } from './mine.js'
