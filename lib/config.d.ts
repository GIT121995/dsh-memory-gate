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
}
export declare const Config: Schema<Config>;
export declare function validateConfig(config: Config): Config;
//# sourceMappingURL=config.d.ts.map