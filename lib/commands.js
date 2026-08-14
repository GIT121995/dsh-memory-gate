import { readableScopeKey, sessionScopeKey, workspaceScopeKey } from './scope.js';
import { MemoryService, parseClaimKind, parseClaimScope } from './service.js';
const USAGE = [
    '/memory status',
    '/memory list [limit]',
    '/memory remember [--scope session|workspace|global] [--kind preference|constraint|fact|procedure|warning] <text>',
    '/memory search <query>',
    '/memory explain <claim-id>',
    '/memory forget <claim-id>',
    '/memory feedback <claim-id> <helped|harmful|stale|conflict|unknown> [detail]',
    '/memory mode <shadow|assist|enforce>',
].join('\n');
export function registerMemoryCommand(commands, service) {
    return commands.register({
        name: 'memory',
        description: 'Manage local long-term memory and CBDC authority policy',
        input: { hint: 'status | remember | search | explain | forget | feedback | mode' },
        recordInput: false,
        handler: ({ agent, rawInput }) => executeMemoryCommand(service, agent, rawInput),
    });
}
export function registerUnavailableMemoryCommand(commands) {
    return commands.register({
        name: 'memory',
        description: 'Report unavailable local long-term memory',
        input: { hint: 'status' },
        recordInput: false,
        handler: ({ rawInput }) => {
            const operation = rawInput.trim().toLocaleLowerCase();
            return operation === '' || operation === 'status'
                ? success('Memory Gate: unavailable. Agent execution continues without long-term memory; inspect the memory-gate startup log.')
                : error('Memory Gate is unavailable; no memory operation was performed.');
        },
    });
}
export function executeMemoryCommand(service, agent, rawInput) {
    try {
        const tokens = tokenize(rawInput.trim());
        const operation = tokens.shift()?.toLocaleLowerCase() ?? 'status';
        const context = commandContext(agent);
        const scopeKeys = [context.sessionKey, ...(context.workspaceKey ? [context.workspaceKey] : []), 'global'];
        switch (operation) {
            case 'help':
                return success(USAGE);
            case 'status': {
                const health = service.repository.health();
                const stats = service.repository.stats();
                return success([
                    `Memory Gate: healthy=${health.ok}, schema=${health.schemaVersion}, fts=${health.ftsAvailable}`,
                    `Mode: ${service.mode} (runtime value; configure the profile to persist it)`,
                    `Claims: ${stats.activeClaims} active, ${stats.tombstonedClaims} forgotten`,
                    `Audit: ${stats.decisions} decisions, ${stats.injections} injections, ${stats.consumptions} feedback records`,
                ].join('\n'));
            }
            case 'list': {
                const requested = tokens[0] === undefined ? 10 : Number(tokens[0]);
                if (!Number.isInteger(requested) || requested < 1 || requested > 50)
                    return error('Usage: /memory list [1-50]');
                const results = service.list(scopeKeys, requested);
                if (!results.length)
                    return success('No active memory in the current scopes.');
                return success(results
                    .map((candidate, index) => {
                    const belief = candidate.belief.alpha / (candidate.belief.alpha + candidate.belief.beta);
                    return `${index + 1}. ${candidate.claim.id} [${candidate.claim.kind}, ${readableScopeKey(candidate.claim.scopeKey)}, belief=${belief.toFixed(2)}] ${truncate(candidate.claim.content, 180)}`;
                })
                    .join('\n'));
            }
            case 'mode': {
                const mode = tokens[0];
                if (!mode || !['shadow', 'assist', 'enforce'].includes(mode))
                    return error('Usage: /memory mode <shadow|assist|enforce>');
                service.setMode(mode);
                return success(`Memory mode is now ${mode}. This runtime override resets when Harness restarts.`);
            }
            case 'remember': {
                const parsed = parseRemember(tokens);
                if (!parsed.text)
                    return error('Memory text is required.\n' + USAGE);
                const scope = parsed.scope ?? (context.workspaceKey ? 'workspace' : 'session');
                const scopeKey = resolveScopeKey(scope, context);
                if (!scopeKey)
                    return error('Workspace memory requires a session working directory.');
                const result = service.remember(parsed.text, {
                    scope,
                    scopeKey,
                    ...(parsed.kind === undefined ? {} : { kind: parsed.kind }),
                    ...(parsed.tags.length ? { tags: parsed.tags } : {}),
                    origin: 'explicit',
                    sourceSessionId: String(agent.session.id),
                });
                return success(`${result.created ? 'Remembered' : 'Already remembered'} ${result.claim.id} (${scope}/${result.claim.kind}).`);
            }
            case 'search': {
                const query = tokens.join(' ').trim();
                if (!query)
                    return error('Usage: /memory search <query>');
                const results = service.search(query, scopeKeys, 10);
                if (!results.length)
                    return success('No matching active memory.');
                return success(results
                    .map((candidate, index) => {
                    const belief = candidate.belief.alpha / (candidate.belief.alpha + candidate.belief.beta);
                    return `${index + 1}. ${candidate.claim.id} [${candidate.claim.kind}, ${readableScopeKey(candidate.claim.scopeKey)}, belief=${belief.toFixed(2)}] ${truncate(candidate.claim.content, 180)}`;
                })
                    .join('\n'));
            }
            case 'explain': {
                const claimId = tokens[0];
                if (!claimId)
                    return error('Usage: /memory explain <claim-id>');
                const claim = service.repository.getClaim(claimId, scopeKeys);
                const belief = claim ? service.repository.getBelief(claim.id) : undefined;
                if (!claim || !belief)
                    return error('Memory claim not found in the current session/workspace/global scopes.');
                const evidence = service.repository.getEvidence(claim.id);
                return success([
                    `${claim.id}: ${claim.content}`,
                    `scope=${readableScopeKey(claim.scopeKey)}, kind=${claim.kind}, state=${claim.state}, origin=${claim.origin}`,
                    `belief=${(belief.alpha / (belief.alpha + belief.beta)).toFixed(3)} (alpha=${belief.alpha}, beta=${belief.beta}, harmful=${belief.harmfulCount})`,
                    `terms=${claim.terms.length}: ${claim.terms.slice(0, 8).join(', ')}${claim.terms.length > 8 ? '…' : ''}`,
                    ...(claim.learnedTerms.length > 0 ? [`learned=${claim.learnedTerms.length}: ${claim.learnedTerms.slice(0, 8).join(', ')}${claim.learnedTerms.length > 8 ? '…' : ''}`] : []),
                    `evidence=${evidence.length}; latest=${evidence[0]?.kind ?? 'none'}`,
                ].join('\n'));
            }
            case 'forget': {
                const claimId = tokens[0];
                if (!claimId)
                    return error('Usage: /memory forget <claim-id>');
                return service.forget(claimId, scopeKeys)
                    ? success(`Forgotten ${claimId}. The record is tombstoned and will no longer be retrieved.`)
                    : error('Active memory claim not found in the current scopes.');
            }
            case 'feedback': {
                const claimId = tokens.shift();
                const outcome = tokens.shift();
                if (!claimId || !outcome || !['helped', 'harmful', 'stale', 'conflict', 'unknown'].includes(outcome)) {
                    return error('Usage: /memory feedback <claim-id> <helped|harmful|stale|conflict|unknown> [detail]');
                }
                const claim = service.repository.getClaim(claimId, scopeKeys);
                if (!claim)
                    return error('Memory claim not found in the current scopes.');
                const detail = tokens.join(' ').trim();
                const belief = service.feedback(claimId, outcome, String(agent.session.id), detail || undefined);
                return success(`Feedback recorded for ${claimId}; belief=${(belief.alpha / (belief.alpha + belief.beta)).toFixed(3)}.`);
            }
            default:
                return error(`Unknown memory operation: ${operation}\n${USAGE}`);
        }
    }
    catch (cause) {
        return error(cause instanceof Error ? cause.message : String(cause));
    }
}
function commandContext(agent) {
    const sessionKey = sessionScopeKey(String(agent.session.id));
    const workspaceKey = workspaceScopeKey(agent.session.header.cwd);
    return { sessionKey, ...(workspaceKey === undefined ? {} : { workspaceKey }) };
}
function resolveScopeKey(scope, context) {
    if (scope === 'global')
        return 'global';
    if (scope === 'workspace')
        return context.workspaceKey;
    return context.sessionKey;
}
function parseRemember(tokens) {
    let scope;
    let kind;
    const tags = [];
    const text = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '--global' || token === '--workspace' || token === '--session') {
            scope = token.slice(2);
            continue;
        }
        if (token === '--scope') {
            const value = parseClaimScope(tokens[index + 1]);
            if (!value)
                throw new Error('--scope must be session, workspace, or global');
            scope = value;
            index += 1;
            continue;
        }
        if (token === '--kind') {
            const value = parseClaimKind(tokens[index + 1]);
            if (!value)
                throw new Error('--kind must be preference, constraint, fact, procedure, or warning');
            kind = value;
            index += 1;
            continue;
        }
        if (token === '--tag') {
            const value = tokens[index + 1]?.trim();
            if (!value)
                throw new Error('--tag requires a value');
            tags.push(value);
            index += 1;
            continue;
        }
        text.push(token ?? '');
    }
    return {
        text: text.join(' ').trim(),
        tags,
        ...(scope === undefined ? {} : { scope }),
        ...(kind === undefined ? {} : { kind }),
    };
}
function tokenize(value) {
    const tokens = [];
    const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
    for (const match of value.matchAll(pattern))
        tokens.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\([\\"'])/g, '$1'));
    return tokens;
}
function truncate(value, length) {
    return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}
function success(text) {
    return { kind: 'success', text };
}
function error(text) {
    return { kind: 'error', text };
}
//# sourceMappingURL=commands.js.map