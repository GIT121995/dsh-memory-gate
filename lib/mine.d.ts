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
 * 解析规范 generation 文件名对应的格式版本。
 * @returns v0 为 `0`；`session.vN.jsonl[.zstd]` 为 `N`；非规范名返回 `undefined`。
 */
export declare function parseLogGeneration(filename: string): number | undefined;
/**
 * 扫描 sessionsRoot 下所有会话日志（每个会话取最高 generation），回挖候选记忆。
 * 全程 fail-open：任何读/解压失败都跳过，绝不抛错。
 */
export declare function mineSessions(sessionsRoot: string, maxSessions: number): MineScanResult;
/** 从 session 日志纯文本里读出首个 `session` 事件的 cwd 对应的 workspace 键。 */
export declare function sessionWorkspaceKey(plaintext: string): string | undefined;
/**
 * 扫描 sessionsRoot，只回挖「属于指定 workspace」的 session 日志。
 * 通过每个日志首个 session 事件的 cwd 哈希匹配 workspaceKey（方案 B：不串味）。
 */
export declare function mineWorkspaceSessions(sessionsRoot: string, workspaceKey: string, maxSessions: number): MineScanResult;
//# sourceMappingURL=mine.d.ts.map