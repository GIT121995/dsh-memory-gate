export interface SecretInspection {
    secret: boolean;
    labels: string[];
}
export declare function inspectForSecrets(text: string): SecretInspection;
export declare function redactForLog(text: string, maxLength?: number): string;
//# sourceMappingURL=redaction.d.ts.map