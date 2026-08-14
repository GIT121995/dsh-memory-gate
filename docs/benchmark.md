# Performance Benchmark

The benchmark is deterministic, local, and does not read the user's memory
database or call a model. Each of three runs creates 1,001 synthetic claims
and executes 300 mixed Chinese/English queries after warm-up. The report uses
the median metric across the three runs and also records the maximum observed
p95.

Run it with:

```bash
npm run benchmark
```

The script measures both an in-memory SQLite database and a temporary database
on the WSL filesystem. The pass threshold is 25 ms p95 for the complete recall
path, including trigger search, capsule merge, CBDC decisions, and audit writes.

## Representative Result

Environment: WSL, Node.js 22.22.1, 2026-08-14.

| Storage/path | mean | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| v1 baseline trigger search, memory | 2.445 ms | 2.151 ms | 3.657 ms | 4.076 ms |
| v1.1 trigger search, memory | 4.097 ms | 3.907 ms | 5.198 ms | 5.669 ms |
| v1.1 full recall + audit, memory | 4.126 ms | 3.885 ms | 5.478 ms | 5.972 ms |
| v1.1 trigger search, WSL disk | 4.208 ms | 4.015 ms | 5.343 ms | 5.859 ms |
| v1.1 full recall + audit, WSL disk | 8.801 ms | 8.512 ms | 11.151 ms | 13.701 ms |

The maximum observed WSL-disk full-recall p95 across the three runs was
11.663 ms. Both quality probes passed: a lightweight Chinese synonym query found the
expected memory, and an unrelated query still received the trusted global
preference through the bounded memory capsule.

## Interpretation

Dual-channel matching adds about 2 ms p95 to the in-memory trigger search in
this workload. The realistic WSL-disk full path remains around 11 ms p95, far
smaller than normal model latency. Results vary by hardware and filesystem, so
the checked-in script is the source of truth rather than this single run.
