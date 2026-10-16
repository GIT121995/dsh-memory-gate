import { homedir } from 'node:os';
import { join } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
/**
 * 默认数据库路径：`<DSH home>/memory/cbdc.sqlite`。
 * DSH home 取 `DSH_HOME`，未设置时退回 `~/.dsh`；与旧 Patch 的
 * `dshHomePath('memory/cbdc.sqlite')` 指向同一位置，存量数据不迁移。
 */
export function defaultDatabasePath() {
    const home = process.env.DSH_HOME?.trim();
    return join(home && home.length > 0 ? home : join(homedir(), '.dsh'), 'memory', 'cbdc.sqlite');
}
export const Config = Schema.object({
    databasePath: Schema.string()
        .description('Absolute path to the private SQLite database. Defaults to <DSH home>/memory/cbdc.sqlite.'),
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
    autoMineWorkspace: Schema.boolean().default(true),
    mineMaxSessions: Schema.number().min(1).max(200).step(1).default(20),
});
export function validateConfig(config) {
    const databasePath = config.databasePath?.trim() ? config.databasePath.trim() : defaultDatabasePath();
    if (!databasePath)
        throw new Error('databasePath cannot be empty');
    if (config.injectionLimit > config.candidateLimit) {
        throw new Error('injectionLimit cannot exceed candidateLimit');
    }
    if (config.capsuleLimit > config.candidateLimit) {
        throw new Error('capsuleLimit cannot exceed candidateLimit');
    }
    return { ...config, databasePath };
}
//# sourceMappingURL=config.js.map