# Changelog

## 0.6.0 - 2026-08-15

- Cost axis (milestone 2.0, P2 + P3):
  - P2 tiered injection: `verify` claims are capped at `verifyMaxChars`
    (default 160) while `use` claims keep the full budget — only confidently
    used memory gets the full spend.
  - P3 deterministic budget governor: a rolling window (`budgetWindowTurns`,
    default 20) tracks injected memory characters; when the window exceeds
    `sessionBudgetChars` (default 20000) the governor tightens by skipping
    `verify` injections for that turn.

## 0.5.0 - 2026-08-15

- Authority: weak lexical matches demote from `use` to `verify` (relevance
  0.12–0.5, non-capsule). The gate no longer confidently injects a memory
  that only weakly overlaps the query — it labels it as an unverified hint.
- Fix capsule composition: a trusted global preference/constraint that also
  matches lexically now keeps its capsule identity (unconditional use) instead
  of being downgraded to a weak trigger match.
- Backtest: the three partial-overlap hard cases now resolve as `verify`
  (weak matches); one synonym-coverage gap (改表 vs 修改 schema) is recorded
  for follow-up. 30/30 clear scenarios pass, F1 = 1.000.

## 0.4.0 - 2026-08-15

- Ship the evaluation data foundation (repo + npm tarball):
  - Decision-layer backtest: 30 synthetic scenarios (all five claim kinds,
    verify branches, quarantine, pollution, cross-scope, paraphrases) with a
    four-leg comparison (gate / top-3 / random / shadow) and a clear-vs-hard
    split; a hard case records the known partial-overlap over-trigger.
  - Result-layer measurement: adoption / token-cost / effect scoring.
  - Trajectory observer: parse DSH session logs (jsonl/zstd) and measure
    per-turn injection adoption and effect.
  - Release gate: `prepublishOnly` runs `check + test + backtest` before any
    publish and aborts on clear-case regressions.
- No runtime behavior change to the plugin itself.

## 0.3.2 - 2026-08-14

- Docs-only release: reposition from storage ("SQLite + FTS5 memory") to
  usage ("retrieved ≠ injected" — use/verify/ignore decisions, feedback
  learning, audit) in the README, package description, and repository
  description. Storage details move to a technical footnote.

## 0.3.1 - 2026-08-14

- Numbered feedback UX: injected claims are labeled `#1`, `#2`, … inside the
  recall block; `/memory feedback` (no args) lists the latest injection with
  those numbers; `/memory feedback <#n> <outcome>` targets one of them; and
  the one-keystroke `/memory ok [#n]` shortcut marks them helped. The legacy
  claim-id feedback syntax still works.

## 0.3.0 - 2026-08-14

- Retrieval quality (zero new dependencies, still no extra model call):
  - Write-time trigger terms: claims persist normalized retrieval terms
    (traditional→simplified, full-width→half-width, stopword filtering) with
    bilingual synonym-group folding via stable `recall_alias_<id>` tokens.
  - Feedback loop: `/memory feedback <id> helped` attaches the distinctive
    terms of recent retrieval runs that injected the claim (normalized terms
    only — never raw query text), so future paraphrases match; auditable via
    `/memory explain`.
- Schema v2: adds `claims.terms_json`, `claims.learned_terms_json`, and
  `retrieval_runs.query_terms_json`; existing databases migrate in place with
  term backfill and an FTS rebuild.
- Test suite: `node --test` coverage for normalization, synonym folding,
  learned-term merging, repository behavior, and the v1→v2 migration.

## 0.2.1 - 2026-08-14

- Docs-only release: lead with the "retrieved ≠ injected" positioning in the
  README, package description, and GitHub repository description.
- Document plugin removal (`dsh plugin --profile web remove dsh-memory-gate`)
  and the retention of the SQLite memory file across uninstall.

## 0.2.0 - 2026-08-14

- Rename the plugin, package, and repository from `dsh-memory-cbdc` to
  `dsh-memory-gate` (plugin id `memory-gate`). CBDC remains the name of the
  Claim → Belief → Decision → Consumption gating mechanism.
- Un-private the package so it can be published to npm; the npm spec
  `dsh-memory-gate` becomes the primary install path, with the Git URL kept
  as a pinned alternative. The old repository URL redirects to the new one.
- The default database path stays `$DSH_HOME/memory/cbdc.sqlite`, so existing
  v0.1.x installations keep their data after upgrading.

## 0.1.2 - 2026-08-14

- Remove the unnecessary install-time `prepare` script so pnpm 10 can install
  the Git-hosted plugin without an `onlyBuiltDependencies` exception.
- Pin the documented Git install command to the tested release tag.

## 0.1.1 - 2026-08-14

- Default to conservative assist mode with a 3-claim/1200-character budget.
- Add trusted global memory capsules and lightweight bilingual trigger recall.
- Add `/memory list [limit]`.
- Retain at most 5,000 retrieval audit runs by default.
- Add repeatable in-memory and WSL-disk performance benchmarks.

## 0.1.0 - 2026-08-14

- Initial local SQLite + FTS5 memory plugin.
- Add CBDC authority decisions, audit records, safe commands, secret rejection,
  automatic extraction, and shadow/assist/enforce modes.
