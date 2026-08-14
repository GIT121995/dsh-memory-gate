import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
export function workspaceScopeKey(cwd) {
    if (!cwd?.trim())
        return undefined;
    let canonical = resolve(cwd);
    try {
        canonical = realpathSync.native(canonical);
    }
    catch {
        // A removed or remote working directory still gets a stable normalized key.
    }
    const digest = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
    return `workspace:${digest}`;
}
export function sessionScopeKey(sessionId) {
    return `session:${sessionId}`;
}
export function readableScopeKey(scopeKey) {
    if (scopeKey === 'global')
        return 'global';
    const separator = scopeKey.indexOf(':');
    return separator === -1 ? scopeKey : `${scopeKey.slice(0, separator)}:${scopeKey.slice(separator + 1, separator + 9)}…`;
}
//# sourceMappingURL=scope.js.map