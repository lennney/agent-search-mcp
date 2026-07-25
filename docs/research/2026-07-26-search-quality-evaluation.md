# How established systems evaluate search quality

Date: 2026-07-26

## What the field actually measures

### 1. Ranked retrieval with judged relevance

TREC builds test collections from topics, submitted runs, and relevance
judgments (`qrels`). Graded judgments support rank-aware measures such as
nDCG. BEIR uses heterogeneous datasets to test out-of-domain retrieval and
reports nDCG as its principal common metric. MTEB likewise compares retrieved
documents with relevant documents and commonly uses nDCG@10.

Implication for Agent Search: use 0-3 relevance judgments and preserve result
order. Report nDCG, Precision, reciprocal rank, and Success@k separately.
Recall is only defensible once judgments come from a pooled candidate set; a
single engine's returned results cannot establish the total number of relevant
web pages.

### 2. Dynamic and adversarial question slices

FreshQA separates fast-changing questions, stable questions, and false-premise
questions. CRAG covers multiple domains, entity popularity levels, complexity,
and temporal dynamism. A single blended score would hide the exact cases web
search is meant to solve.

Implication: every Agent Search query must carry language, intent/category,
freshness class, and difficulty. Publish per-slice results before an overall
average.

### 3. Answer quality is not retrieval quality

RAG evaluation separates retrieved-context relevance from whether the final
answer is supported by that context. Citation research further distinguishes
citation correctness from citation faithfulness: a citation can appear to
support a statement even when the model did not genuinely rely on it.

Implication: keep answer correctness, result relevance, citation support, and
citation completeness as different labels. Never infer citation quality from
the number of URLs.

### 4. Human preference is useful but biased

Search Arena collects paired, multi-turn system traces and human preference
votes. Its analysis found that citation count can increase preference even when
the citations do not support the attributed claims.

Implication: paired preference is a secondary product metric. It cannot replace
blind relevance and citation-support judgments. Human-verified releases should
use at least two independent reviewers plus adjudication, with engine identity
hidden during labeling.

### 5. Production search adds online experiments

Google describes large-scale A/B experimentation for search changes,
interleaving for safer ranking comparisons, and task-completion time as a user
outcome. Click-through rate alone mixes relevance with position and examination
bias.

Implication: Agent Search should start with reproducible offline gates, then add
opt-in paired/interleaved experiments after it has real usage. Never treat raw
clicks as ground-truth relevance.

## Agent Search benchmark decision

The benchmark is split into four tracks:

1. **Retrieval:** graded qrels, nDCG@5, Precision@5, reciprocal rank@5,
   Success@5; add Recall only after multi-system pooling.
2. **Answer and citation:** answer correctness, citation support, and later
   claim-level citation completeness/faithfulness.
3. **System:** tokens per correct answer, p50/p95 latency, raw-trace coverage,
   and failure-disclosure rate.
4. **Slices:** English/Chinese, evergreen/dynamic/false-premise, factual,
   navigational, comparison, multi-hop, and adversarial.

Bootstrap labels may test metric code but are never eligible for a public
quality claim. A fixture becomes claim-eligible only after explicit
`human-verified` metadata and review evidence.

## Primary references

- [NIST TREC](https://trec.nist.gov/index.html)
- [How TREC builds topics, runs, and qrels](https://trec.nist.gov/howto.html)
- [BEIR paper](https://arxiv.org/abs/2104.08663)
- [MTEB retrieval evaluation](https://docs.mteb.org/overview/available_tasks/retrieval/)
- [FreshLLMs / FreshQA](https://arxiv.org/abs/2310.03214)
- [Comprehensive RAG Benchmark](https://arxiv.org/abs/2406.04744)
- [Search Arena](https://arxiv.org/abs/2506.05334)
- [Ragas faithfulness metric](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/)
- [Correctness is not Faithfulness in RAG Attributions](https://arxiv.org/abs/2412.18004)
- [Google overlapping experiment infrastructure](https://research.google/pubs/overlapping-experiment-infrastructure-more-better-faster-experimentation/)
- [Google task-completion-time search evaluation](https://research.google/pubs/evaluating-web-search-using-task-completion-time/)
