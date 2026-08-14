# Changelog

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
