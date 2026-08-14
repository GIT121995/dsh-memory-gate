import type { Context } from '@deepseek-ai/cordis';
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
import { type UserMessage } from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import { MemoryService } from './service.js';
interface OpenTurn {
    turn: number;
    messages: Array<{
        text: string;
        eventSeq: number;
    }>;
}
export declare function attachHarness(ctx: Context, service: MemoryService): void;
export declare function observeSessionEvent(service: MemoryService, openTurns: Map<string, OpenTurn>, session: Session, event: SessionEvent, onError?: (cause: unknown) => void): void;
export declare function injectRecall(service: MemoryService, agent: Agent, messages: UserMessage[], logger?: {
    warn(format: unknown, ...params: unknown[]): void;
}): PreStepDecision;
export {};
//# sourceMappingURL=harness.d.ts.map