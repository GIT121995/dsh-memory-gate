import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MemoryRepository, MemoryService } from '../lib/index.js'

const CFG = {
  mode: 'assist', automaticExtraction: false, candidateLimit: 16, capsuleLimit: 2,
  injectionLimit: 3, maxInjectionChars: 1200, auditRetentionRuns: 5000,
  minUseBelief: 0.7, maxUseRisk: 0.45, harmfulQuarantineThreshold: 2, freshnessHalfLifeDays: 180,
  verifyMaxChars: 160, sessionBudgetChars: 20_000, budgetWindowTurns: 20,
}

test('P2：verify 记忆注入被截断到 verifyMaxChars', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, CFG)
    const longContent = `我偏好${'很长的冗余内容'.repeat(50)}`
    repo.remember({ scope: 'global', scopeKey: 'global', kind: 'preference', content: longContent, origin: 'heuristic' })
    const recall = svc.prepareRecall({ query: '偏好', sessionId: 's1', sessionScopeKey: 's1' })
    assert.ok(recall, '应注入 verify')
    const line = recall.text.split('\n').find((l) => l.startsWith('- [VERIFY'))
    assert.ok(line, '应含 VERIFY 行')
    assert.ok(line.length < 260, `verify 行应被截断，实际 ${line.length}`)
    assert.ok(longContent.length > 260, '前置条件：原文应远超截断阈值')
  } finally {
    repo.close()
  }
})

test('P3：超预算后跳过 verify、只注入 use', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, { ...CFG, sessionBudgetChars: 60, budgetWindowTurns: 20 })
    // use（显式 fact）+ verify（启发式 fact），同 query 都命中
    repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: '项目代码在 A 目录', origin: 'explicit' })
    repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: '项目代码在 B 目录', origin: 'heuristic' })

    const first = svc.prepareRecall({ query: '项目代码在哪个目录', sessionId: 's1', sessionScopeKey: 's1' })
    assert.ok(first, '首次应注入')
    assert.ok(first.text.includes('A 目录'), 'use 应注入')
    assert.ok(first.text.includes('B 目录'), '首次未超预算，verify 也应注入')

    // 首次注入已把滚动窗口字符数推到预算之上
    const second = svc.prepareRecall({ query: '项目代码在哪个目录', sessionId: 's1', sessionScopeKey: 's1' })
    assert.ok(second, '第二次应仍有 use 注入')
    assert.ok(second.text.includes('A 目录'), 'use 仍注入')
    assert.ok(!second.text.includes('B 目录'), '超预算后 verify 应被跳过')
  } finally {
    repo.close()
  }
})

test('P3：未超预算时 verify 正常注入', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, { ...CFG, sessionBudgetChars: 100_000 })
    repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: '项目代码在 B 目录', origin: 'heuristic' })
    const recall = svc.prepareRecall({ query: '项目代码在哪个目录', sessionId: 's1', sessionScopeKey: 's1' })
    assert.ok(recall)
    assert.ok(recall.text.includes('B 目录'))
  } finally {
    repo.close()
  }
})
