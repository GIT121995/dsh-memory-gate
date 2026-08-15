/**
 * 轨迹解析器 —— 把 DSH 的 session 事件流解析成「回合」视图。
 *
 * 每回合产出：{ query（人类提问文本）, assistantText（模型最终回答文本）, injections[] }
 * 注入检测：消息文本含 <long_term_memory> 标记，且能从中抽出 claim id。
 *
 * 纯函数、可单测；zstd 解压由调用方（observe.mjs）负责。
 */

export function parseEvents(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // 忽略无法解析的行（损坏/半行）
    }
  }
  return events
}

function messageText(data) {
  return (data?.content ?? []).map((part) => part?.text ?? '').join('\n')
}

function claimIdsOf(memoryText) {
  const ids = [...memoryText.matchAll(/mem_[0-9a-f-]+/g)].map((m) => m[0])
  return [...new Set(ids)]
}

/** 从记忆块里抽出每条 claim 的正文（去掉 `- [USE #1 mem_x kind]` 前缀与 boilerplate）。 */
function claimContentsOf(memoryText) {
  return memoryText
    .split('\n')
    .filter((line) => line.trimStart().startsWith('- ['))
    .map((line) => line.replace(/^- \[[^\]]*\]\s*/, '').trim())
    .filter(Boolean)
}

/**
 * @param {Array} events 已解析的事件数组
 * @returns {Array<{turn:number, query:string, assistantText:string, injections:Array<{claimIds:string[], text:string}>}>}
 */
export function observeSession(events) {
  let currentTurn = 0
  const turns = new Map()
  const ensure = (turn) => {
    if (!turns.has(turn)) turns.set(turn, { turn, query: '', assistantText: '', injections: [] })
    return turns.get(turn)
  }

  for (const event of events) {
    const type = event?.type
    const data = event?.data ?? {}
    if (type === 'turn/start') {
      currentTurn = data.turn ?? currentTurn
      ensure(currentTurn)
    } else if (type === 'user/message') {
      const text = messageText(data)
      if (text.includes('<long_term_memory>')) {
        ensure(currentTurn).injections.push({ claimIds: claimIdsOf(text), text, contents: claimContentsOf(text) })
      } else if (text.trim()) {
        const turn = ensure(currentTurn)
        turn.query = turn.query ? `${turn.query}\n${text}` : text
      }
    } else if (type === 'assistant/message') {
      const turn = data.turn ?? currentTurn
      const texts = (data.message?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text)
      ensure(turn).assistantText += texts.join('\n')
    }
  }
  return [...turns.values()]
}
