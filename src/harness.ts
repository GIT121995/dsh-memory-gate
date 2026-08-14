import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

import { registerMemoryCommand } from './commands.js'
import { isHumanUserMessage, messageText } from './message-text.js'
import { sessionScopeKey, workspaceScopeKey } from './scope.js'
import { MemoryService } from './service.js'

interface OpenTurn {
  turn: number
  messages: Array<{ text: string; eventSeq: number }>
}

export function attachHarness(ctx: Context, service: MemoryService): void {
  const logger = ctx.logger('memory-gate')
  const openTurns = new Map<string, OpenTurn>()

  ctx.effect(() => registerMemoryCommand(ctx.commands, service), 'memory-gate: command')
  ctx.on('session/disposed', (session) => openTurns.delete(String(session.id)))
  ctx.on('session/event', (session, event) => {
    if (!service.config.automaticExtraction) return
    observeSessionEvent(service, openTurns, session, event, (cause) => {
      logger.warn('automatic extraction omitted: %s', cause instanceof Error ? cause.message : String(cause))
    })
  })
  ctx.on(
    'agent/pre-step',
    async (payload, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind !== 'enter' || payload.signal.aborted || payload.step !== 1) return decision
      return injectRecall(service, payload.agent, decision.messages, logger)
    },
    { prepend: true },
  )
}

export function observeSessionEvent(
  service: MemoryService,
  openTurns: Map<string, OpenTurn>,
  session: Session,
  event: SessionEvent,
  onError: (cause: unknown) => void = () => undefined,
): void {
  const sessionId = String(session.id)
  try {
    if (event.type === 'turn/start') {
      openTurns.set(sessionId, { turn: event.data.turn, messages: [] })
      return
    }
    const open = openTurns.get(sessionId)
    if (!open) return
    if (event.type === 'user/message' && isHumanUserMessage(event.data)) {
      const text = messageText(event.data)
      if (text) open.messages.push({ text, eventSeq: event.seq })
      return
    }
    if (event.type === 'turn/end' && event.data.turn === open.turn) {
      openTurns.delete(sessionId)
      const workspaceKey = workspaceScopeKey(session.header.cwd)
      for (const message of open.messages) {
        service.extractAndRemember(message.text, {
          sessionId,
          sessionScopeKey: sessionScopeKey(sessionId),
          ...(workspaceKey === undefined ? {} : { workspaceKey }),
          sourceEventSeq: message.eventSeq,
        })
      }
    }
  } catch (cause) {
    onError(cause)
  }
}

export function injectRecall(
  service: MemoryService,
  agent: Agent,
  messages: UserMessage[],
  logger: { warn(format: unknown, ...params: unknown[]): void } = { warn: () => undefined },
): PreStepDecision {
  try {
    const query = messages.filter(isHumanUserMessage).map(messageText).filter(Boolean).join('\n').trim()
    if (!query) return { kind: 'enter', messages }
    const sessionId = String(agent.session.id)
    const workspaceKey = workspaceScopeKey(agent.session.header.cwd)
    const recall = service.prepareRecall({
      query,
      sessionId,
      sessionScopeKey: sessionScopeKey(sessionId),
      ...(workspaceKey === undefined ? {} : { workspaceKey }),
    })
    if (!recall) return { kind: 'enter', messages }
    const memoryMessage = createUserMessage({
      content: [{ type: 'text', text: recall.text }],
      source: { kind: 'plugin', plugin: 'dsh-memory-gate', form: 'recall' },
    })
    service.repository.recordInjection(recall.runId, sessionId, service.mode, recall.claimIds, String(memoryMessage.id))
    return { kind: 'enter', messages: [...messages, memoryMessage] }
  } catch (cause) {
    logger.warn('memory retrieval omitted: %s', cause instanceof Error ? cause.message : String(cause))
    return { kind: 'enter', messages }
  }
}
