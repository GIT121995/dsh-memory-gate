export function messageText(message) {
    if (!message || typeof message !== 'object')
        return '';
    const content = message.content;
    if (typeof content === 'string')
        return content.trim();
    if (!Array.isArray(content))
        return '';
    return content
        .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
}
export function isHumanUserMessage(message) {
    if (!message || typeof message !== 'object')
        return false;
    const source = message.source;
    return source?.kind === 'user';
}
//# sourceMappingURL=message-text.js.map