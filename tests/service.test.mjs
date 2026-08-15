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

test('P4：负反馈率超阈值 → 自动降级 shadow', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, CFG)
    const ids = []
    for (let i = 0; i < 5; i += 1) {
      const { claim } = repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: `记忆${i}`, origin: 'explicit' })
      ids.push(claim.id)
    }
    for (let i = 0; i < 3; i += 1) svc.feedback(ids[i], 'harmful', 's1')
    for (let i = 3; i < 5; i += 1) svc.feedback(ids[i], 'helped', 's1')
    assert.equal(svc.mode, 'shadow', '应自动降级为 shadow')
    assert.equal(svc.healthState.degraded, true)
    assert.ok(svc.healthState.negativeRate >= 0.4)
  } finally {
    repo.close()
  }
})

test('P4：样本不足不下结论（防小样本误杀）', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, CFG)
    const { claim } = repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: 'x', origin: 'explicit' })
    svc.feedback(claim.id, 'harmful', 's1')
    svc.feedback(claim.id, 'harmful', 's1')
    assert.equal(svc.mode, 'assist', '样本不足不应降级')
    assert.equal(svc.healthState.degraded, false)
  } finally {
    repo.close()
  }
})

test('P4：手动 setMode 恢复清除降级', () => {
  const repo = new MemoryRepository(':memory:')
  try {
    const svc = new MemoryService(repo, CFG)
    const ids = []
    for (let i = 0; i < 5; i += 1) {
      const { claim } = repo.remember({ scope: 'global', scopeKey: 'global', kind: 'fact', content: `记忆${i}`, origin: 'explicit' })
      ids.push(claim.id)
    }
    for (let i = 0; i < 4; i += 1) svc.feedback(ids[i], 'harmful', 's1')
    svc.feedback(ids[4], 'helped', 's1')
    assert.equal(svc.mode, 'shadow')
    svc.setMode('assist')
    assert.equal(svc.mode, 'assist')
    assert.equal(svc.healthState.degraded, false)
  } finally {
    repo.close()
  }
})
