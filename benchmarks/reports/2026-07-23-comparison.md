# Token Optimization — Comparison Report

## Change Summary

**OUTPUT_STYLE=compact** mode added. Three improvements over normal mode:

| Change | Why It Helps |
|--------|-------------|
| Remove `rate_limits` field | ~200 bytes of metadata LLMs never use |
| Shorten `security_note` | ~130 bytes → one sentence |
| Round `confidence` to 2 decimals | `0.55` instead of `0.5473684210526316` |

All field names remain `title`/`url`/`snippet`/`confidence` — zero agent readability cost.

## Benchmark Results

| Metric | Normal | Compact | Savings |
|--------|--------|---------|---------|
| **Avg response size** | **5,951 bytes** | **5,554 bytes** | **-6.7%** |
| **Total (30 queries)** | **178,526 bytes** | **166,619 bytes** | **-11,907 bytes** |

## Per-Query Breakdown

| Query | Normal | Compact | Saved |
|-------|--------|---------|-------|
| English (avg) | 5,409 | 4,962 | 8.3% |
| Chinese (avg) | 6,493 | 6,147 | 5.3% |

## What This Means

**6.7% savings with zero readability tradeoff.** The LLM receives the same structured data — just without noise. Rate limits, verbose warnings, and unnecessarily precise confidence values were consuming token budget without providing value.

## Future Potential

Adding `SNIPPET_LENGTH=120` would push savings to **20-25%** by truncating snippets more aggressively. But this changes what the LLM sees, so it should be opt-in.
