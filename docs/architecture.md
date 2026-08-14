# dsh-memory-gate v1 详细设计

## 1. 设计目标

插件解决的不是“保存更多聊天记录”，而是让跨会话记忆具备四个独立阶段：

1. **Claim**：从用户明确陈述中形成带作用域、来源和生命周期的主张。
2. **Belief**：用 `alpha / (alpha + beta)` 表示当前可用置信度，并累计负面证据。
3. **Decision**：结合相关度、新鲜度、置信度和风险，输出 `use/verify/ignore`。
4. **Consumption**：人工记录 helped/harmful/stale/conflict，反向更新 Belief。

Harness Session 日志仍是会话事实源；插件数据库只是可重建的长期记忆投影和
独立审计侧车。卸载插件不会改变 Session 事件格式和可读性。

## 2. 组件与数据流

```text
user/message ── turn/end ──> conservative extractor ──> secret gate
                                                           │
                                                           v
                                                    Claim + Evidence
                                                           │
first agent/pre-step ── query/scopes ──> FTS + term rank ──┤
                                                           v
                                             Belief + CBDC decision
                                                │       │       │
                                              use     verify   ignore
                                                │       │       └─ audit only
                                                └── mode policy ──> recall message
                                                                       │
                                                            injection audit

/memory feedback ──> Consumption + Evidence ──> alpha/beta/harmful_count
```

实现模块：

- `repository.ts`：迁移、SQLite 表、FTS5、事务、审计和 tombstone。
- `extractor.ts` / `redaction.ts`：确定性提取与凭据阻断。
- `authority.ts`：纯函数 CBDC 决策，可独立测试。
- `service.ts`：作用域检索、排序、模式策略、注入文本装配。
- `harness.ts`：唯一 Harness 适配层，监听 `session/event` 和
  `agent/pre-step`。
- `commands.ts`：唯一的人类控制入口。

## 3. 数据模型

### claims

核心字段为：`id`、`scope`、`scope_key`、`kind`、`content`、`tags_json`、
`state`、`origin`、`sensitivity`、`content_hash`、来源 Session/Event、有效期和
时间戳。`state=tombstoned` 后永不参与检索。

作用域键：

- session：`session:<session-id>`；
- workspace：`workspace:<canonical-path-sha256-prefix>`，不保存原路径；
- global：固定为 `global`，只允许显式创建。

### evidence / beliefs

新显式 Claim 从 `alpha=6, beta=1` 开始；启发式 Claim 从 `4,2` 开始，默认
不足以直接 `use`。反馈增量为：helped `+alpha 1`，harmful `+beta 5` 且
`harmful_count +1`，stale `+beta 2`，conflict `+beta 4`，unknown 不改变
Belief。每次非 unknown 更新同时写 Evidence。

### audit tables

- `retrieval_runs`：查询哈希、Session、workspace 和候选数量，不复制原始提示；
- `authority_decisions`：每个候选的动作、理由码和四项得分；
- `injections`：实际进入上下文的 Claim ID 与生成消息 ID；
- `consumption`：人工结果与可选说明。

数据库使用 `PRAGMA user_version=1` 做幂等迁移，写入用同步短事务。文件目录
权限创建为 `0700`；SQLite WAL 只用于磁盘数据库。

## 4. 检索与 CBDC 决策

召回分成两个本地通道：

- capsule：最多 2 条可信的 explicit global preference/constraint，不要求当前
  查询复述关键词；
- trigger：查询当前 session、当前 workspace 和 explicit global，先限制最多
  500 条活跃 Claim，再结合 FTS5、英文词项、中文二元词组、常用同义线索和
  标签重排。

两个通道按 Claim ID 合并后统一进入 CBDC。最终排序权重：

```text
rank = lexical × 0.62 + belief × 0.23 + freshness × 0.15 + scope boost + capsule boost
```

决策优先级：

1. 非 active → `ignore`；
2. 已过期 → `verify`；
3. `harmful_count` 达隔离阈值 → `ignore`；
4. 相关度低于 0.12 → `ignore`；
5. 新鲜度低于 0.2 → `verify`；
6. Belief 低于配置阈值或 Risk 高于阈值 → `verify`；
7. 其余 → `use`。

Risk 基线按 Claim kind 区分，再叠加置信度不确定性和 harmful 历史。每项阈值
均在插件配置中，不依赖隐藏环境变量。

## 5. Harness 集成

自动提取只消费 `source.kind=user` 的 `user/message`，在匹配的 `turn/end` 后
写入，绝不学习 assistant、tool 或插件生成消息。恢复时的 seed 事件不会重复
发布，因此不会重复提取历史。

召回监听 `agent/pre-step`，调用下游 `next()` 后只在第一步、未取消、存在真实
人类消息时运行。召回内容用 `createUserMessage` 生成：

```ts
source: { kind: 'plugin', plugin: 'dsh-memory-gate', form: 'recall' }
```

注入文本声明其是用户记忆而非系统指令，并转义尖括号。任何检索、策略、审计
或数据库异常都返回原消息数组，保证 Agent fail-open。数据库在启动时无法打开
时，插件只注册一个 unavailable 状态命令，不注册提取或注入监听器，Harness
仍可正常启动。

## 6. 安全、隐私与运维

- 存储前检查常见 API Key、GitHub/AWS Token、Bearer、密码赋值和私钥头；
- `/memory` 设置 `recordInput=false`，避免把管理命令原文复制进 Session 的
  command lifecycle；
- `forget` 只做 tombstone；v1 不提供不可恢复的 hard delete；
- 默认 assist，但限制最多 3 条、1200 字符；需要零模型可见影响时可切回 shadow；
- 只保留最近 5000 次 retrieval run 的决策和注入审计，Claim、Evidence、
  Consumption 不会被自动删除；
- 数据库可以随插件停机备份，恢复时同时保留 `-wal/-shm` 或先正常停机。

## 7. 故障边界与后续版本

v1.1 不包含向量服务、LLM 抽取器、历史回填、浏览器管理 UI 或自动 outcome
归因。词法召回不足时，后续可以在 Repository 之上增加可选 embedding 索引，
但 Claim、Belief、Decision 和 Consumption 仍保持同一权威模型。

升级时只允许顺序增加 `PRAGMA user_version` migration；不得就地重写旧
Evidence 或删除 tombstone。Harness RC API 若变化，仅修改 `harness.ts` 适配层。
