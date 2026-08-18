import Schema from '@deepseek-ai/schemastery';
import type { MemoryMode } from './contracts.js';
export interface Config {
    databasePath: string;
    mode: MemoryMode;
    automaticExtraction: boolean;
    candidateLimit: number;
    capsuleLimit: number;
    injectionLimit: number;
    maxInjectionChars: number;
    auditRetentionRuns: number;
    minUseBelief: number;
    maxUseRisk: number;
    harmfulQuarantineThreshold: number;
    freshnessHalfLifeDays: number;
    /** P2：verify（待核验）记忆的单条注入字符上限；use 不受此限。 */
    verifyMaxChars?: number;
    /** P3：滚动窗口内记忆注入的字符预算，超预算即收紧（跳过 verify）。 */
    sessionBudgetChars?: number;
    /** P3：预算滚动窗口的回合数。 */
    budgetWindowTurns?: number;
    /** P4：自我诊断——负反馈占比阈值，达到即自动降级 shadow。 */
    healthNegativeRateThreshold?: number;
    /** P4：自我诊断——下结论所需的最小反馈样本数（防小样本误杀）。 */
    healthMinSamples?: number;
    /** 方案 B：会话首轮自动回挖当前 workspace 的历史 session（默认开）。 */
    autoMineWorkspace?: boolean;
    /** 方案 B：自动回挖时最多扫描的 session 文件数。 */
    mineMaxSessions?: number;
}
export declare const Config: Schema<Config>;
export declare function validateConfig(config: Config): Config;
//# sourceMappingURL=config.d.ts.map