import type { ClaimKind } from './contracts.js';
export interface MinedClaim {
    content: string;
    kind: ClaimKind;
    tags: string[];
}
/** 从一段文本里回挖第一条记忆 cue（非锚定句首）。 */
export declare function mineClaims(text: string): MinedClaim[];
/** 从 session 日志纯文本（jsonl）里抽取用户消息，逐条回挖。 */
export declare function mineSessionLog(plaintext: string): MinedClaim[];
export interface MineScanResult {
    claims: MinedClaim[];
    scannedFiles: number;
}
/**
 * 扫描 sessionsRoot 下所有 `session.jsonl.zstd`，回挖候选记忆。
 * 全程 fail-open：任何读/解压失败都跳过，绝不抛错。
 */
export declare function mineSessions(sessionsRoot: string, maxSessions: number): MineScanResult;
//# sourceMappingURL=mine.d.ts.map