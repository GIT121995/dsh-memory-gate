# Changelog

## 0.14.0 - 2026-10-16

- DSH STORE listing remediation. No retrieval/supersession behavior change;
  the config contract and package surface changed:
  - The Bundle Patch is now a no-evaluation literal document:
    `cordis.patch.yml` no longer contains `!!js dshHomePath('memory/cbdc.sqlite')`.
    `databasePath` became optional; when omitted the plugin resolves
    `<DSH_HOME or ~/.dsh>/memory/cbdc.sqlite` at runtime — the same path as
    before, so existing databases stay where they are and no migration runs.
  - `@deepseek-ai/schemastery` moved from `dependencies` to
    `peerDependencies` (kept in `devDependencies` for local build/tests),
    matching the DSH plugin convention that the host provides it. The
    published package now declares no runtime dependencies.
  - npm package surface trimmed to runtime artifacts only (`lib`, the Bundle
    Patch, README/CHANGELOG/LICENSE, docs). `backtest/` and
    `fixtures/synthetic/` remain in the repository for development but are no
    longer published, and therefore leave the Store's fixed-source review
    surface (removing the `child_process` command signal and the JSONL
    inventory scan). Deleted the unreferenced
    `fixtures/synthetic/session-sample.jsonl`.
  - Evidence: `npm run verify` — 61 tests, clear backtest scenarios 33/33,
    F1 = 1.000; `npm pack --dry-run` contains no `backtest/` or `fixtures/`
    entries; a disposable DSH profile install confirms the peer
    `@deepseek-ai/schemastery` resolves and the default database path is
    unchanged.
  - README config example (no more `!!js`) and install pin updated to
    `0.14.0`.

## 0.13.2 - 2026-10-12

- Compatibility record for the official latest-three window moving to
  `0.2.0-rc.2`, `0.2.1-alpha.1`, `0.2.1-alpha.2` (no behavior change):
  - Add the exact `dsh.compatibility.dshReleases` record for `0.2.1-alpha.2`
    (`compatible`). The existing `^0.2.1-alpha.1` ranges in `dsh.compatibility.dsh`
    and the four harness `peerDependencies` already accept `0.2.1-alpha.2`
    (same 0.2.1 prerelease tuple), so no range change was needed.
  - Evidence: temporary checkout with cordis `4.0.5-alpha.1` plus
    `@deepseek-ai/dsh-agent`, `dsh-commands`, `dsh-llm` and `dsh-session` at
    `0.2.1-alpha.2`; a full `npm run verify` passes — 61 tests, clear backtest
    scenarios 33/33, F1 = 1.000. The release gate itself still runs on the
    locked `0.1.0-rc.6` surface with the same result.
  - No behavior change: supersession policy, retrieval, thresholds and
    backtest scenarios are unchanged from 0.13.1.
  - Sync README compatibility window and Git-install pin to `0.13.2`.

## 0.13.1 - 2026-10-08

- Compatibility/listing release for the official latest-three DSH window
  (`0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-alpha.1`):
  - Add exact `dsh.compatibility.dshReleases` records (`compatible`) for the
    three releases, widen `dsh.compatibility.dsh` and the four harness
    `peerDependencies` ranges to accept `0.2.0-rc.x` / `0.2.1-alpha.1`, and
    extend the cordis peer range with `^4.0.5-alpha.1` for the 0.2.1 window.
  - Adapt injected-message provenance to the 0.2 message-source contract:
    `@deepseek-ai/dsh-llm` 0.2 removed the shared catch-all `plugin` kind, so
    the plugin now declares its own `MessageSourceMap` kind through declaration
    merging — `{ kind: 'dsh-memory-gate', form: 'recall' }` in
    `src/message-source.ts`. The 0.1.x map is merge-extensible the same way,
    so one code path compiles against both windows, and consumers that do not
    know the kind fall through to opaque content (the documented behavior for
    unknown producers). `docs/architecture.md` updated.
  - Evidence: typecheck plus a full `npm run verify` in a temporary checkout
    per release (cordis + the four harness packages installed at the matching
    versions) — 61 tests, clear backtest scenarios 33/33, F1 = 1.000 for each
    of the three; the release gate still runs on the locked `0.1.0-rc.6`
    surface (same 61 tests, 33/33, F1 = 1.000), so the plugin keeps building
    against its oldest supported Harness. Runtime verification on 0.2.x was
    not performed on this machine; the runtime baseline remains `0.1.5-rc.1`.
  - No behavior change: supersession policy, retrieval, thresholds and
    backtest scenarios are unchanged from 0.13.0.
  - Sync README compatibility window and Git-install pin to `0.13.1`.

## 0.13.0 - 2026-10-08

- Supersession no longer decides from bare 60% term overlap; it now requires a
  same-proposition signal (behavior change; reported against 0.12.0 by
  `Dedale-Project` in deepseek-ai/deepseek-harness Discussion #1345):
  - New `decideSupersede()` keeps the 60% overlap threshold as a *candidate*
    gate only. The older claim is marked `superseded` only when the new claim
    either carries explicit replacement intent (「不再/改为/改用/换成/取代/
    替换/废除/作废/弃用」, `instead of`, `no longer`, `replace`, `switch to`,
    `supersede`, `deprecate`) or the two claims share all structured
    discriminators (identifiers, paths, numbers/versions, quoted literals).
  - When both sides carry their own discriminators, applicability conditions
    differ and **both claims stay active** — the reported case
    (`BEGIN IMMEDIATE`/`busy_timeout` vs `UPDATE`/`SQLITE_BUSY_SNAPSHOT`,
    70% term overlap) is no longer silently collapsed into one branch.
  - Information-loss guard: a new claim that drops an old discriminator
    (for example `busy_timeout`) no longer replaces the older claim.
  - Origin guard: heuristic (auto-mined) claims never supersede explicit
    user claims.
  - `consolidate()` runs the same policy, so manual merges cannot bypass it.
  - Backtest fixtures: `conditional-branches-keep-both` (both branches must be
    injected), `explicit-replacement-supersedes`, `paraphrase-still-supersedes`;
    unit tests for intent detection, discriminator extraction, refinement,
    information loss and the origin guard.
  - Verified: `npm run verify` passes — 61 tests, clear scenarios 33/33,
    F1=1.000, CI gate PASSED.
  - README supersession contract, test/backtest counts, Git-install pin and
    version updated to `0.13.0`.

## 0.12.0 - 2026-09-10

- Session-log mining follows the harness session-format generations, so mining
  keeps working after the DSH 0.1.5 session-format V3 upgrade (behavior change):
  - Recognize canonical generation filenames — v0 keeps `session.jsonl[.zstd]`,
    later generations are `session.v<N>.jsonl[.zstd]`. Non-canonical names
    (uppercase, leading zeros, an explicit `v0` tag, temp files) are ignored.
  - Read only the highest generation inside each session directory, matching the
    persistence backend's own selection: a migrated session is never mined from
    its stale pre-migration copy, and it is only counted/scanned once.
  - Also read plaintext logs (`compression: 'none'`), not just Zstandard frames.
  - Extraction itself is unchanged: cue phrases, claim kinds, heuristic origin,
    `mined` tags and scopes stay as they were, and the V3 `user/message` envelope
    plus header `cwd` are unchanged, so workspace matching behaves as before.
  - Verified: unit tests for V3 discovery, highest-generation selection, plaintext
    logs, workspace matching and non-canonical-name rejection; a real
    `session.v3.jsonl.zstd` written by DSH 0.1.5-rc.1 is discovered, decompressed
    and cwd-matched; `npm run verify` passes (clear 30/30, F1=1.000).
  - Sync README version, Git-install pin and the mining description to `0.12.0`.

## 0.11.4 - 2026-09-10

- Compatibility/listing release for the official latest-three DSH window
  (`0.1.5-alpha.1`, `0.1.5-alpha.2`, `0.1.5-rc.1`), the window that ships the
  DeepSeek-V4.1-Flash GA path (harness model id `deepseek-flash`). The plugin had
  been moved to `unlisted` by DSH STORE under
  `DSH_LATEST_THREE_COMPATIBILITY_HOLD` because none of the three had an exact
  record:
  - Add `dsh.compatibility.dshReleases` exact records for all three releases
    (`compatible`) so the fixed-Commit catalog can restore the listing.
  - Widen `peerDependencies` for `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-commands`,
    `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-session` to accept `0.1.5-alpha.x`
    and `0.1.5-rc.x`; add the matching `dsh.compatibility.dsh` range.
  - Evidence: typecheck against each of the three releases (temporary installs of
    the four harness packages), plus a full `npm run verify` with `0.1.5-rc.1`
    installed — clear 30/30, F1=1.000, CI gate PASSED. The release gate itself
    still runs on the locked `0.1.0-rc.6` surface, so the plugin keeps building
    against its oldest supported Harness.
  - Sync README target Harness (`0.1.5-rc.1`) and the Git-install version pin
    to `0.11.4`.
  - No runtime behavior change; existing `use`/`verify`/`ignore` decisions and
    backtest scenarios remain unchanged.

## 0.11.3 - 2026-09-08

- Compatibility/listing release for DSH STORE (AI-Scarlett/DSH-Store#636):
  - Add `dsh.compatibility.dshReleases` exact compatibility records for the
    current official latest-three DSH window (`0.1.2-rc.1`, `0.1.3-alpha.1`,
    `0.1.3-alpha.2`) so the fixed-Commit catalog can restore the listing.
  - Widen `peerDependencies` for `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-commands`,
    `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-session` to also accept
    `0.1.3-alpha.x`; add the matching `dsh.compatibility.dsh` range.
  - Sync README target Harness and Git-install version pin to `0.11.3`.
  - No runtime behavior change; existing `use`/`verify`/`ignore` decisions and
    backtest scenarios remain unchanged.

## 0.11.2 - 2026-08-28

- Compatibility release for upstream `dsh` v0.1.2-alpha.1:
  - Widen `peerDependencies` for `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-commands`,
    `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-session` to accept `0.1.0-rc.6`,
    `0.1.1-rc.x`, and `0.1.2-alpha.x`.
  - Sync README target Harness and Git-install version pin to `0.11.2`.
  - No runtime behavior change; existing `use`/`verify`/`ignore` decisions and
    backtest scenarios remain unchanged.

## 0.11.1 - 2026-08-18

- Bugfix release (independent code review):
  - A single long `use` claim could be silently dropped: the per-claim cap
    didn't reserve header/prefix/closing overhead, so a claim near the budget
    pushed the total over `maxInjectionChars` and `break` left nothing
    injected. Now the content cap is computed from the remaining budget.
  - `consolidate()` wrote `supersedes` on the superseded (older) claim,
    opposite to `remember()` (which records it on the newer claim). Unified to
    "the newer claim records the id of the one it supersedes".
  - `mine` / `mineWorkspaceOnce` aborted the whole batch when one mined claim
    was secret-like (the per-claim `remember` throw wasn't caught). Now each
    claim is try-caught, preserving fail-open.
  - Retrieval candidates were truncated to the newest `scanLimit` rows, so an
    old but FTS-matching claim was unreachable once active claims exceeded the
    window. FTS-only hits are now unioned into the candidate set.
  - README version numbers were stale (0.9.0 → 0.11.0).

## 0.11.0 - 2026-08-16

- Workspace mining (Plan B): on a session's first step, the plugin mines the
  historical session logs belonging to the same workspace (matched by each
  log's `cwd`) and re-extracts declared memory cues into workspace-scoped
  claims. Runs once per session, bounded (`mineMaxSessions`, default 20),
  fail-open, and opt-out via `autoMineWorkspace: false`. Other projects'
  logs are never mined.

## 0.10.0 - 2026-08-16

- Relax the live auto-extractor: memory cues ("记住…", "我偏好…", "always",
  …) now match mid-sentence, not just at the start. The claim is taken from
  the cue to the sentence end, so leading context is dropped. Still the same
  conservative cue phrases and heuristic low-confidence origin.

## 0.9.0 - 2026-08-16

- Similarity dedup (supersede): on write, a claim whose terms overlap an
  existing active claim in the same scope by ≥ 60% supersedes it (the old one
  is marked `superseded` and the new one records the link). Adopts the
  "update instead of append" rule from community discussion #1345.
- `/memory consolidate` retroactively merges near-duplicate active claims.
- Schema v3 adds `claims.supersedes`.

## 0.8.0 - 2026-08-15

- Log mining (milestone 3.0, P5): `/memory mine [1-500]` scans historical
  session logs (zstd, via `node:zlib`) and re-extracts memory cues the live
  extractor missed (e.g. mid-sentence "记住…"). Mined claims land as
  heuristic low-confidence claims tagged `mined` in global scope, and still
  pass the CBDC gate. Fail-open throughout: unreadable logs are skipped.

## 0.7.0 - 2026-08-15

- Self-diagnosis (milestone 3.0, P4): a rolling health vector over recent
  feedback — when negative outcomes (harmful/stale/conflict) exceed
  `healthNegativeRateThreshold` (default 0.4) with at least
  `healthMinSamples` (default 5) samples, the gate auto-degrades to `shadow`
  (zero injection) and surfaces a warning in `/memory status`. Manual
  `/memory mode` override clears the degraded state.

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
