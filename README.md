# dsh-memory-gate（记忆闸门）

> 核心立场：**检索到 ≠ 注入**。前身是 `dsh-memory-cbdc`（v0.1.x）；
> v0.2.0 起更名为 **dsh-memory-gate**，CBDC 保留为机制名（见下）。
> 旧仓库地址仍会重定向到本仓库。

DeepSeek Harness 的长期记忆插件，只回答一个问题：**记忆记住了，然后呢？**
它把稳定信息保存为可撤销的 Claim，并在每次模型调用前执行 CBDC
（Claim → Belief → Decision → Consumption）权威门控——每条记忆先经裁决
（`use` / `verify` / `ignore`），才决定能否进入上下文；使用后的反馈
（helped/harmful）反向更新置信度，越用越准，全程可审计。默认注入
≤3 条 / 1200 字符，不增加第二次模型调用。

（存储层：本地 SQLite + FTS5，无 embedding、无外部记忆 API。）

这是社区插件，不属于 DeepSeek 官方项目。许可证为 [MIT](LICENSE)。

Long-term memory for DeepSeek Harness that cares about how memory is
**used**, not just stored — **retrieved ≠ injected**: every recall passes
CBDC (Claim → Belief → Decision → Consumption) authority gating and lands
as an explainable `use` / `verify` / `ignore` decision before it can enter
context. Post-use feedback updates belief, so memory gets more accurate
over time — all auditable, bounded (≤3 claims / 1200 chars by default),
no extra model call. (Local SQLite + FTS5 storage; no embeddings, no
external memory API.)

当前版本：`0.11.0`。目标 Harness：`0.1.0-rc.6`，Node.js `>=22.5`。

## v1 能力

- **使用前裁决**：每条记忆注入前过 CBDC（Claim → Belief → Decision →
  Consumption）权威门控，输出可解释的 `use` / `verify` / `ignore` 决策。
- **使用中克制**：默认最多注入 3 条、1200 字符；全局偏好走 capsule
  通道特权注入；不增加第二次模型调用。
- **使用后学习**：`/memory ok`（或 `feedback <#n> helped`）把当次查询的
  区分性词项学进触发词（只存词项、不存查询原文），harmful/stale 降低
  置信度并触发隔离——越用越准，`/memory explain` 全程可审计。
- **近重复合并**：写入时新记忆与同作用域已有词项重叠 ≥ 60% 时，旧条目
  自动标 `superseded`、新记忆记录取代关系；`/memory consolidate` 可手动
  全库合并，避免"相近表达"堆成重复记忆。
- **三种运行模式**：`shadow`（只审计零注入）、`assist`（默认，注入 use +
  标出 verify）、`enforce`（只注入高置信）——按场景切换"怎么用"。
- 双通道召回：少量可信全局偏好/约束组成记忆胶囊，其余记忆经词项触发。
- session、workspace、global 三种作用域；workspace 路径只保存哈希键。
- 显式 `/memory` 管理命令和保守的中英文自动提取。

技术规格：本地 SQLite + FTS5 存储，不调用 embedding 或外部记忆 API；
写时触发词含繁→简、全角→半角归一与双语同义折叠；API Key、Token、密码
和私钥样式内容在落库前拒绝；数据库或策略异常时不阻断 Agent，只省略
本次记忆注入。

## 安装

Harness 的插件管理依赖 `pnpm`。

Linux / WSL：

```bash
npm install -g pnpm
dsh plugin --profile web add dsh-memory-gate
dsh web --dump-config | sed -n '/memory-gate/,+18p'
```

Windows PowerShell：

```powershell
npm install -g pnpm
dsh plugin --profile web add dsh-memory-gate
dsh web
```

也可以用 Git 地址安装并锁定版本：

```bash
dsh plugin --profile web add git+https://github.com/GIT121995/dsh-memory-gate.git#v0.11.0
```

卸载：

```bash
dsh plugin --profile web remove dsh-memory-gate
```

卸载后重启 `dsh web`。记忆数据保留在 `$DSH_HOME/memory/cbdc.sqlite`，重装即可继续使用；如要彻底清除，删除该文件即可。

安装后重启正在运行的 `dsh web`。Bundle 默认写入
`$DSH_HOME/memory/cbdc.sqlite`（文件名沿用 CBDC 机制名），并以保守 `assist`
模式启动。每次模型调用仍只有原来的一次；插件只在本地检索，并把最多 3 条
相关记忆放入该次调用的上下文。

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中持久调整模式时，后置覆盖
必须重述该插件拥有的完整配置：

```yaml
- id: memory-gate
  config:
    databasePath: !!js dshHomePath('memory/cbdc.sqlite')
    mode: assist
    automaticExtraction: true
    candidateLimit: 16
    capsuleLimit: 2
    injectionLimit: 3
    maxInjectionChars: 1200
    auditRetentionRuns: 5000
    minUseBelief: 0.7
    maxUseRisk: 0.45
    harmfulQuarantineThreshold: 2
    freshnessHalfLifeDays: 180
    verifyMaxChars: 160
    sessionBudgetChars: 20000
    budgetWindowTurns: 20
    healthNegativeRateThreshold: 0.4
    healthMinSamples: 5
    autoMineWorkspace: true
    mineMaxSessions: 20
```

会话回挖（方案 B）：会话首轮自动扫描**同一工作区**的历史 session 日志，补提取
其中声明过的记忆 cue，挖进 workspace 作用域——不串到别的项目。每会话只跑一次，
`autoMineWorkspace: false` 可关，`mineMaxSessions` 限制扫描文件数。

成本分级：`use`（放心用）拿全宽，`verify`（待核验）单条最多 `verifyMaxChars`
字符——敢用才配多花。滚动窗口（`budgetWindowTurns` 回合）内注入超
`sessionBudgetChars` 即自动收紧（跳过 verify），成本可控、可审计。

自我诊断：最近反馈里负反馈（harmful/stale/conflict）占比达到
`healthNegativeRateThreshold`（且样本 ≥ `healthMinSamples`）时，自动降级为
`shadow`（零注入）并在 `/memory status` 里红标警示；`/memory mode assist`
可手动恢复。

## 使用

```text
/memory status
/memory list 10
/memory remember --kind preference 我偏好简洁中文回答
/memory remember --global --kind constraint 不要在回复中暴露凭据
/memory search 简洁中文
/memory explain mem_<uuid>
/memory feedback                 # 列出最近注入的记忆（带 #n 编号）
/memory feedback 1 helped        # 按编号反馈
/memory ok                       # 最近注入的记忆全部记为 helped（常用）
/memory ok 2                     # 只反馈其中第 2 条
/memory mine 50                  # 从历史 session 日志回挖漏掉的「记住…」
/memory consolidate              # 合并近重复记忆（旧 → superseded）
/memory forget mem_<uuid>
/memory mode assist
```

`/memory list` 显示当前 session/workspace/global 作用域内最近的活跃记忆。
`/memory mode` 只修改当前进程；重启后回到 Profile 配置。`forget` 是可审计
的 tombstone，不会物理删除历史记录。

日志回挖（`/memory mine`）：扫描历史 session 日志，补提取实时提取器漏掉的
记忆 cue（如句中的「记住…」），以 heuristic 低置信 + `mined` 标签存入全局
作用域——宁缺毋滥，挖出来的也要过 CBDC 裁决、可由你反馈校准。

相似去重（supersede）：写入时若与同作用域已有记忆词项重叠 ≥ 60%，旧的自动
标记为 `superseded`、新记忆记录取代关系——相近表达不再堆成近重复条目。
`/memory consolidate` 可手动触发一次全库合并。

反馈（`feedback` / `ok`）是记忆学习的入口：`helped` 会把当次查询的区分性
词项学进该条记忆的触发词，让以后的换说法也能命中；`harmful`/`stale` 会
降低置信度并触发隔离。注入文本里每条记忆带 `#n` 编号，直接对应
`/memory feedback <#n> ...` 的编号。

模式语义：

- `shadow`：计算并审计，零模型可见注入。
- `assist`：注入 `use`，并把 `verify` 明确标为待核验线索；默认模式。
- `enforce`：只注入 `use`，省略 `verify` 和 `ignore`。

## 开发与验证

```bash
npm install
npm run check          # 类型检查 + 构建
npm test               # 21 个单元/集成测试
npm run backtest       # 决策层回测：30 场景四腿对照（gate/top-3/random/shadow）
npm run result         # 结果层：注入采纳度 / 成本 / 效果分
npm run observe <log>  # 轨迹观测：对真实 session 日志量采纳度
npm pack --dry-run
```

发布门：`prepublishOnly` 会在任何 `npm publish` 前自动跑 `check + test +
backtest`，回测清晰场景不过关即中止发布。

发布前的三轮基准中位数（Node.js 22.22.1，1001 条合成记忆，每轮 300
次查询）：WSL 磁盘上的触发检索 p95 `5.343ms`，包含 CBDC 决策和 SQLite
审计的完整召回 p95 `11.151ms`，三轮最大观测 p95 `11.663ms`。基准不会
访问真实记忆数据库，也不会调用模型，详见
[性能基准](docs/benchmark.md)。

召回和安全边界见 [架构说明](docs/architecture.md)。

## v1 限制

- 同义/触发词召回仍是词法级：只覆盖常见表达，不等价于通用语义检索；繁→简映射覆盖常见繁体字。
- 自动提取只识别明显的“记住、以后、I prefer、always”等表达，宁缺毋滥。
- 不回填安装前的历史会话，也不重复保存完整 Harness transcript。
- Node.js 22 会为内置 `node:sqlite` 打印 experimental warning，不影响运行。
