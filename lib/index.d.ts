import type { Context } from '@deepseek-ai/cordis';
import { Config, type Config as MemoryConfig } from './config.js';
export declare const name = "dsh-memory-cbdc";
export declare const inject: string[];
export { Config };
export declare function apply(ctx: Context, config: MemoryConfig): void;
export type * from './contracts.js';
export { decideAuthority } from './authority.js';
export { extractDurableClaims } from './extractor.js';
export { injectRecall, observeSessionEvent } from './harness.js';
export { inspectForSecrets, redactForLog } from './redaction.js';
export { MemoryRepository } from './repository.js';
export { sessionScopeKey, workspaceScopeKey } from './scope.js';
export { MemoryService } from './service.js';
//# sourceMappingURL=index.d.ts.map