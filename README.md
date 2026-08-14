# dsh-memory-gate（记忆闸门）

> 核心立场：**检索到 ≠ 注入**。前身是 `dsh-memory-cbdc`（v0.1.x）；
> v0.2.0 起更名为 **dsh-memory-gate**，CBDC 保留为机制名（见下）。
> 旧仓库地址仍会重定向到本仓库。

DeepSeek Harness 的本地长期记忆插件，核心立场是**检索到 ≠ 注入**：
它把稳定信息保存为可撤销的 Claim，并在每次模型调用前执行 CBDC
（Claim → Belief → Decision → Consumption）权威门控，每条记忆都要
经过裁决才能进入上下文。有界（默认 ≤3 条 / 1200 字符）、全程可审计、
不增加第二次模型调用。

这是社区插件，不属于 DeepSeek 官方项目。许可证为 [MIT](LICENSE)。

Local long-term memory for DeepSeek Harness — **retrieved ≠ injected**:
every recall passes CBDC (Claim → Belief → Decision → Consumption)
authority gating before it can enter context. SQLite-only, bounded
(≤3 claims / 1200 chars by default), auditable, no extra model call.

当前版本：`0.3.1`。目标 Harness：`0.1.0-rc.6`，Node.js `>=22.5`。

## v1 能力

- SQLite + FTS5 本地存储，不调用 embedding 或外部记忆 API。
- 双通道召回：少量可信全局偏好/约束组成记忆胶囊，其余记忆通过
  英文词项、中文二元词组、轻量同义线索和标签触发。
- **写时触发词**：落库时抽取归一化词项（繁→简、全角→半角、停用词过滤），
  同义词组双向折叠（如 简洁/concise、部署/deploy），换一种说法也能召回。
- **反馈回灌**：`/memory feedback <id> helped` 会把当次查询的区分性词项
  学进该条记忆的触发词（只存词项、不存查询原文），越用越准，全部可在
  `/memory explain` 里审计。
- session、workspace、global 三种作用域；workspace 路径只保存哈希键。
- 显式 `/memory` 管理命令和保守的中英文自动提取。
- 可解释的 `use`、`verify`、`ignore` 决策与完整检索/注入审计。
- `shadow`、`assist`、`enforce` 三种运行模式，默认保守 `assist`。
- 默认最多注入 3 条、1200 字符；不增加第二次模型调用。
- API Key、Token、密码和私钥样式内容在落库前拒绝。
- 数据库或策略异常时不阻断 Agent，只省略本次记忆注入。

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
dsh plugin --profile web add git+https://github.com/GIT121995/dsh-memory-gate.git#v0.3.1
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
```

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
/memory forget mem_<uuid>
/memory mode assist
```

`/memory list` 显示当前 session/workspace/global 作用域内最近的活跃记忆。
`/memory mode` 只修改当前进程；重启后回到 Profile 配置。`forget` 是可审计
的 tombstone，不会物理删除历史记录。

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
npm run check
npm pack --dry-run
```

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
