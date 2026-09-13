# Evaluation

Measures retrieval quality and end-to-end suggestion quality against a hand-built
gold set, so changes to chunking / embeddings / prompting can be judged with
numbers instead of vibes.

## Files

| Path | What |
|------|------|
| `gold.jsonl` | The gold set — one JSON object per line (see format below). |
| `run.py` | The harness. No new dependencies (`requests` + `chromadb`). |
| `results/` | Timestamped JSON runs, one per invocation, for before/after comparison. |

## Gold format

```json
{"input": "Fibrillation auriculaire", "codes": ["I48"], "note": "any I48.x"}
{"input": "Toux purulente", "codes": [], "note": "abstain: not in CoCoA's commented subset"}
```

- `input` — the query string, as a user would type it (≤ 100 chars).
- `codes` — acceptable CIM-10 codes. **An empty list means the system should
  abstain** (return no suggestions). Use a 3-char family root (`"I48"`, `"E11"`)
  when any sub-code is acceptable; use a full code (`"R39.2"`) to require it.
- `note` — free text, ignored by the harness.

Code matching is: exact, or same 3-char category where one code is a prefix of
the other. So gold `"I48"` matches a predicted `"I48.0"`, but gold `"I48.1"`
does **not** match predicted `"I48.2"`.

## Run

```bash
# End-to-end (needs the backend running: npm run dev)
python eval/run.py

# Retrieval only (needs rag_database/, no backend)
python eval/run.py --retrieval --k 5
```

Env vars mirror the backend: `BACKEND_URL`, `CHROMA_PATH`, `CHROMA_COLLECTION`,
`OLLAMA_URL`, `EMBED_MODEL`, `EMBED_QUERY_PREFIX`, `AUTH_USER` / `AUTH_PASSWORD`
(default `demo` / `demo` — e2e mode logs in for the JWT-guarded `/suggest_code`).

### A/B-ing two collections

`cocoa_cim10_v2` (nomic prefixes + cosine) is the default. The prefix-free
`cocoa_cim10` (L2) is still in `rag_database/` for comparison. Retrieval mode
reads ChromaDB directly, so set the collection + prefix to match:

```bash
# default (prefixed + cosine)
EMBED_QUERY_PREFIX="search_query: " CHROMA_COLLECTION=cocoa_cim10_v2 python eval/run.py --retrieval

# prefix-free baseline (L2)
EMBED_QUERY_PREFIX="" CHROMA_COLLECTION=cocoa_cim10 python eval/run.py --retrieval
```

End-to-end mode goes through the backend, so restart it with the matching
`CHROMA_COLLECTION` / `EMBED_QUERY_PREFIX` and just run `python eval/run.py`.
Each result file is named `<mode>-<collection>-<timestamp>.json`.

Last A/B on the 28-entry gold set (2026-09-09): `v2` won retrieval MRR
0.52 vs 0.40 and e2e any-hit 0.72 vs 0.60. See `IMPROVEMENTS.md` item 6.

### Benchmarking a suggestion model

E2e mode measures whatever LLM the backend is configured with. To compare
models, restart the backend pointing at each one, then run `python eval/run.py`:

```bash
# hosted model via OpenRouter
LLM_PROVIDER=openai OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
  OPENAI_API_KEY=sk-... LLM_MODEL=openai/gpt-4o-mini npm --prefix nestjs-backend run dev
```

The prompt is identical across adapters, so the metric deltas are the model's.

## Metrics

**Retrieval mode** (over gold entries with a non-empty `codes`):
- `recall_at_k` — fraction where a gold code appears in the top-k chunks.
- `mrr` — mean reciprocal rank of the first chunk with a gold code.

**End-to-end mode**:
- `any_hit_rate` / `top1_rate` — a gold code among the suggestions / as the first.
- `mean_precision` / `mean_recall` — over the graded (non-abstain) entries.
- `abstention_accuracy` — fraction of abstain entries answered with no suggestion.
- `grounded_rate` — share of all suggestions whose code was in the retrieved context.
- `latency_mean_s` / `latency_p95_s`.

## Expanding the gold set

`gold.jsonl` holds 28 entries (25 graded, 3 abstain): the 8 originals plus one
per remaining exercise input, annotated against the CoCoA index and
<https://www.aideaucodage.fr/cim>. Each `note` records the reasoning; entries
flagged *ABSENT de l'index* (`J14` ×2) are deliberate hard cases where the
correct code is not in CoCoA.

Still worth doing:

- Have a real coder review every entry added on 2026-09-09 (medium confidence).
- Grow past 28 for tighter confidence intervals, and add more `"codes": []`
  cases — the ability to *not* suggest a code when CoCoA does not cover it is
  part of what we measure.
- Some calls are policy, not fact (how aggressively to abstain on isolated
  symptoms like *Fièvre*, *Désaturation*); revisit once prompt-level abstention
  (D12) is tuned. Note: a *retrieval-distance* cutoff can't help here — see
  `IMPROVEMENTS.md` item 9, the signal doesn't separate abstain-worthy queries
  from answerable ones.
