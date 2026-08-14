import type { ClaimKind } from './contracts.js';
export interface ExtractedClaim {
    content: string;
    kind: ClaimKind;
    tags: string[];
}
export declare function extractDurableClaims(text: string): ExtractedClaim[];
//# sourceMappingURL=extractor.d.ts.map