interface TextPart {
  type?: unknown
  text?: unknown
}

interface MessageLike {
  content?: unknown
  source?: { kind?: unknown }
}

export function messageText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as MessageLike).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part: TextPart) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function isHumanUserMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false
  const source = (message as MessageLike).source
  return source?.kind === 'user'
}
