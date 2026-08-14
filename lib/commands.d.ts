import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CommandResult, CommandRuntime } from '@deepseek-ai/dsh-commands';
import { MemoryService } from './service.js';
export declare function registerMemoryCommand(commands: CommandRuntime, service: MemoryService): () => void;
export declare function registerUnavailableMemoryCommand(commands: CommandRuntime): () => void;
export declare function executeMemoryCommand(service: MemoryService, agent: Agent, rawInput: string): CommandResult;
//# sourceMappingURL=commands.d.ts.map