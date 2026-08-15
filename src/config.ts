import Schema from '@deepseek-ai/schemastery'

import type { MemoryMode } from './contracts.js'

export interface Config {
  databasePath: string
  mode: MemoryMode
  automaticExtraction: boolean
  candidateLimit: number
  capsuleLimit: number
  injectionLimit: number
  maxInjectionChars: number
  auditRetentionRuns: number
  minUseBelief: number
  maxUseRisk: number
  harmfulQuarantineThreshold: number
  freshnessHalfLifeDays: number
  /** P2：verify（待核验）记忆的单条注入字符上限；use 不受此限。 */
  verifyMaxChars?: number
  /** P3：滚动窗口内记忆注入的字符预算，超预算即收紧（跳过 verify）。 */
  sessionBudgetChars?: number
  /** P3：预算滚动窗口的回合数。 */
  budgetWindowTurns?: number
  /** P4：自我诊断——负反馈占比阈值，达到即自动降级 shadow。 */
  healthNegativeRateThreshold?: number
  /** P4：自我诊断——下结论所需的最小反馈样本数（防小样本误杀）。 */
  healthMinSamples?: number
}

export const Config: Schema<Config> = Schema.object({
  databasePath: Schema.string()
    .description('Absolute or profile-relative path to the private SQLite database.')
    .required(),
  mode: Schema.union(['shadow', 'assist', 'enforce'])
    .description('shadow audits only; assist labels uncertain memory; enforce injects only use decisions.')
    .default('assist'),
  automaticExtraction: Schema.boolean()
    .description('Extract conservative memory claims from completed user turns.')
    .default(true),
  candidateLimit: Schema.number().min(1).max(100).step(1).default(16),
  capsuleLimit: Schema.number().min(0).max(5).step(1).default(2),
  injectionLimit: Schema.number().min(1).max(20).step(1).default(3),
  maxInjectionChars: Schema.number().min(256).max(16_000).step(1).default(1200),
  auditRetentionRuns: Schema.number().min(100).max(100_000).step(1).default(5000),
  minUseBelief: Schema.number().min(0).max(1).default(0.7),
  maxUseRisk: Schema.number().min(0).max(1).default(0.45),
  harmfulQuarantineThreshold: Schema.number().min(1).max(20).step(1).default(2),
  freshnessHalfLifeDays: Schema.number().min(1).max(3650).default(180),
  verifyMaxChars: Schema.number().min(64).max(2000).step(1).default(160),
  sessionBudgetChars: Schema.number().min(0).max(1_000_000).step(1).default(20_000),
  budgetWindowTurns: Schema.number().min(1).max(200).step(1).default(20),
  healthNegativeRateThreshold: Schema.number().min(0).max(1).default(0.4),
  healthMinSamples: Schema.number().min(1).max(1000).step(1).default(5),
})

export function validateConfig(config: Config): Config {
  if (!config.databasePath.trim()) throw new Error('databasePath cannot be empty')
  if (config.injectionLimit > config.candidateLimit) {
    throw new Error('injectionLimit cannot exceed candidateLimit')
  }
  if (config.capsuleLimit > config.candidateLimit) {
    throw new Error('capsuleLimit cannot exceed candidateLimit')
  }
  return config
}
