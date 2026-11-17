# Eval summary

_Generated 2026-11-17T14:52:17+00:00 from the latest run of each config. Retrieval metrics are over answerable questions; answer metrics are LLM-as-judge._

| Config | Backend | Mode | Rerank | Hit@5 (page) | Hit@5 (doc) | MRR | Faithfulness | Citation correctness | Refusal accuracy | p50 ms | p95 ms | Cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pgvector-vector | pgvector | vector | no | 96.7% | 100.0% | 0.792 | — | — | — | 50 | 83 | 0.0000 |
| pgvector-keyword | pgvector | keyword | no | 93.3% | 96.7% | 0.783 | — | — | — | 33 | 39 | 0.0000 |
| pgvector-hybrid | pgvector | hybrid | no | 96.7% | 96.7% | 0.832 | 0.942 | 0.919 | 97.1% | 90 | 122 | 0.4621 |
| mongodb-hybrid | mongodb | hybrid | no | 96.7% | 100.0% | 0.867 | — | — | — | 47 | 78 | 0.0000 |
