# Technical notes — CoCoA / CIM-10 RAG

This document explains *why* the system is built the way it is: the RAG
theory behind it, the architecture, the rationale for each technical choice,
and — closing it out — its limitations and where it'd go next. It's the
counterpart to the READMEs (which say *how* to run things); this one is
meant to stand on its own for a reviewer.

## 1. What it does

Given a short clinical phrase ("Fibrillation auriculaire", "Toux purulente"),
the system suggests CIM-10 (the French PMSI implementation of ICD-10) codes,
each with a justification and any extra coding guidance — but only codes it
can point to inside **CoCoA**, an expert-annotated PDF of CIM-10 coding rules.
It's a coding *assistant*, not a coding *authority*: every suggestion is
traceable to a passage of that document, and the system says nothing rather
than guess when CoCoA doesn't cover the input.

## 2. Why RAG (and not just prompting a model directly)

A general-purpose LLM already "knows" a great deal of ICD-10 from training
data, but two things make that knowledge unsuitable to trust directly here:

- **It's the wrong knowledge.** CIM-10 coding in practice is governed by
  *local* rules — French PMSI conventions, hospital coding habits, and
  CoCoA's own judgment calls (e.g. "code functional acute renal failure as
  `R39.2`, not `N17.x`" — a rule you cannot derive from the ICD-10 tabular
  list itself, only from a coding authority's commentary). A model's generic
  training-data knowledge of ICD-10 doesn't know these local exceptions.
- **It's unverifiable.** Even when a model's parametric answer happens to be
  right, there's no way to check it against a source without one. RAG turns
  "trust the model" into "verify against a retrieved passage" — the
  `grounded` flag (§4) is exactly this check made explicit in the API.

So the model is deliberately restricted, by prompt, to reasoning only over
text retrieved from CoCoA for that specific query, and the retrieval step is
what makes that restriction meaningful rather than just a hopeful suggestion
in the prompt.

## 3. Architecture

_(Mermaid versions of both diagrams below are in [`ARCHITECTURE-DIAGRAMS-MERMAID.md`](ARCHITECTURE-DIAGRAMS-MERMAID.md).)_

```
CoCoA.pdf
   │  python-src/chunkize_new.py
   │  (split into one chunk per CIM-10 code + its expert commentary,
   │   embed each chunk with nomic-embed-text, store in ChromaDB)
   ▼
rag_database/  (ChromaDB, collection "cocoa_cim10_v2", 12,817 chunks)
   │  served over HTTP by `chroma run` (or the `chroma` Docker service)
   ▼
NestJS backend
   │
   │  POST /suggest_code {symptom}          (JWT-guarded)
   ▼
AppController ─► RAGService  (orchestrator)
        │
        │  1. retrieve(symptom, k=5)
        ├─► PassageRetriever port ─► ChromaPassageRetriever
        │       embeds the query (same nomic-embed-text model + task
        │       prefix as indexing) → kNN query against ChromaDB
        │
        │  2. drop chunks past RAG_MAX_DISTANCE (unset by default — see §5)
        │  3. if nothing survives → return { suggestions: [] }, no LLM call
        │
        │  4. suggest(symptom, passages)
        ├─► CodeSuggester port ─► OllamaCodeSuggester (LLM_PROVIDER=ollama, code default)
        │                      └─ OpenAiCodeSuggester (LLM_PROVIDER=openai)
        │       both build the identical prompt (src/generation/prompt.ts)
        │       and parse the identical JSON contract
        │
        │  5. mark each suggestion grounded = code ∈ retrieved chunk codes
        ▼
{ query, suggestions: [{ code_icd10, description, justification, bonus_info, grounded }] }
```

ChromaDB and the suggestion LLM each sit behind an abstract-class port
(`PassageRetriever` / `CodeSuggester`, doubling as NestJS DI tokens), so both
are swappable and independently fakeable in tests. `RAGService` only
orchestrates — retrieve, filter, generate, ground-check — none of the
ChromaDB or LLM specifics live there.

### Deployment topology (Docker)

```
┌─────────────┐   274 MB, baked in at   ┌──────────────┐
│ ollama-embed │◄──build time (nomic-───│ (build step) │
└──────┬───────┘   embed-text)          └──────────────┘
       │ embeddings only
┌──────▼───────┐        ┌─────────┐        ┌─────────┐
│    backend   │◄──────►│ chroma  │        │ indexer │  (opt-in, profiles:[indexer])
└──────┬───────┘        └─────────┘        └────┬────┘
       │ generation (multi-GB, not containerized)  │ writes rag_database/
       ▼                                            ▼ (must not run while chroma is up)
  host Ollama, or a hosted API (LLM_PROVIDER=openai)
```

Embeddings are containerized (`nomic-embed-text` is 274 MB); generation isn't
(qwen3-coder and comparable models are multi-GB) — it either reaches a host
Ollama or a hosted API, and it's the one prerequisite `docker compose up`
cannot satisfy on its own: `docker-compose.yml` ships with
`LLM_PROVIDER=openai` pointed at the **host's** Ollama over its
OpenAI-compatible `/v1` endpoint (`http://host.docker.internal:11434/v1`,
no API key), which still requires that host Ollama to actually be running
with the model pulled — see `nestjs-backend/README.md`'s "Setting up local
Ollama" section, or override the same three env vars to point at a real
hosted API instead. Building the index is a separate, explicit step
(`docker compose --profile indexer run --rm indexer`), not part of `up`: it's
an occasional, offline operation, not something that should run on every
container start, and it writes `rag_database/` directly (an embedded
ChromaDB `PersistentClient`) so it must not run concurrently with the
`chroma` HTTP server touching the same files.

## 4. Rationale for each choice

**Local Ollama, made swappable to a hosted API.** The code-level default
(`LLM_PROVIDER=ollama`, `POST /api/generate`, what `npm run dev` uses with no
env set) needs no API key and no network egress — appropriate for local dev
and for keeping clinical-sounding input local. But locking the design to one
local model would make it impossible to compare quality against a frontier
model, so generation sits behind a `CodeSuggester` port with two adapters:
`OllamaCodeSuggester` and `OpenAiCodeSuggester` (`POST
{OPENAI_BASE_URL}/chat/completions`, the de facto standard wire format also
spoken by OpenAI, OpenRouter, Groq, and Ollama's own `/v1` endpoint). Both
build the identical prompt and parse the identical JSON contract, so
`eval/run.py` measures a model swap directly, not a confound of the wiring.
The Docker Compose default (§3) explicitly picks `openai` over `ollama` for
this stack — calling Ollama's `/v1` endpoint rather than its native one keeps
generation on the same wire format as a hosted API, so swapping to one later
is a three-variable env change, not a code change.

**ChromaDB.** The Python indexer needs an embedded vector store with
metadata filtering and streaming inserts (the PDF is processed one chunk at a
time); the JS backend needs an HTTP client. ChromaDB is one library that
covers both without gluing two different databases together — the Python
side writes with `PersistentClient`, the JS side reads over `chroma run`'s
HTTP server pointed at the same directory.

**nomic-embed-text.** A small (274 MB), locally-runnable embedding model with
explicit task-prefix support (`search_document: ` / `search_query: `) — the
right size to containerize (§3) and to keep indexing/query latency low, while
still being purpose-built for asymmetric retrieval rather than a general
sentence embedding.

**Chunk-per-code.** `chunkize_new.py` splits CoCoA on a CIM-10-code-shaped
line (`[A-Z]\d{2}(\.\d{1,2})?`) and attaches all following prose (the expert
commentary) to that code, until the next code line. This mirrors exactly how
a coder or the retrieval step will want to consult the document: "what does
CoCoA say about `I48.0`?" rather than an arbitrary fixed-size text window that
might split a code from its own commentary or merge two unrelated codes'
notes. It's also the weakest link in the pipeline today (§10).

**`qwen3-coder` as the default generation model.** Chosen for structured-JSON
reliability and being runnable locally at reasonable speed on the dev
hardware; not chosen for any coding-specific reason beyond that its
instruction-following on a rigid JSON schema was reliable in practice. The
swap mechanism above exists specifically because this choice hasn't been
benchmarked against alternatives yet (open item, see §11).

**`format: json` / `response_format: {type: "json_object"}`.** The API
contract is structured (`code_icd10`, `description`, `justification`,
`bonus_info` per suggestion); free-text generation would require a fragile
regex/markdown-fence extraction step. Forcing JSON mode at the API level
means a malformed response is the model's fault (and cleanly surfaces as a
`GenerationError` → `503`), not a parsing bug on the caller's side.

**`temperature: 0`.** Medical coding suggestions should be reproducible: the
same symptom description should not intermittently produce a different code
depending on sampling. Determinism also makes `eval/run.py` results
meaningful — a metric change reflects a code, prompt or model change, not
sampling noise.

**The `grounded` flag.** `RAGService` computes `retrievedCodes = new
Set(passages.map(p => p.code))` and marks each suggestion `grounded:
retrievedCodes.has(code_icd10)`. `true` means the LLM cited a code that was
literally one of the chunks it was handed — the strongest evidence the
suggestion isn't fabricated. `false` means the code came from somewhere else
in the model's reasoning: often legitimately, from a coding rule mentioned in
a *different* chunk's commentary (e.g. "functional ARF → `R39.2`, not
`N17.x`" appearing inside the `R39.2` chunk while the query superficially
matches `N17.x`-shaped text), but occasionally from outright invention. It's
a cheap, structural hallucination signal, not a correctness proof — a
grounded code can still be the wrong code, and (per the eval results, §9) an
ungrounded one is sometimes the *right* code that simply isn't in the index.

## 5. Retrieval: distance metric and the abstention threshold

Two ChromaDB collections exist side by side in `rag_database/` (12,817 chunks
each as of the B5 chunking fix, 2026-09-13 — both were rebuilt together to
keep this A/B apples-to-apples): `cocoa_cim10` (prefix-free, **L2** distance
— the original build) and `cocoa_cim10_v2` (nomic task prefixes, **cosine**
distance — the default since 2026-09-09). Cosine distance is bounded [0, 2],
which is what makes a distance-based cutoff (`RAG_MAX_DISTANCE`) even
conceivable in the first place — L2 is unbounded and scale-dependent.

The A/B below predates the B5 rebuild (8,919 chunks each at the time) but the
conclusion — v2 wins — still holds; the numbers are historical, not current:

| | `cocoa_cim10` | `cocoa_cim10_v2` |
|---|---|---|
| retrieval Recall@5 | 0.56 | **0.60** |
| retrieval MRR | 0.40 | **0.52** |
| e2e any-hit rate | 0.60 | **0.72** |
| e2e mean precision / recall | 0.57 / 0.55 | **0.63 / 0.67** |

But the same distance signal turned out **not** to be useful for the second
purpose it was built for — deciding when to abstain. A sweep of the top-5
cosine distances across all 28 gold queries found that the distance of a
*correctly* retrieved chunk (range 0.167–0.381), the distance of the nearest
chunk on a *miss* (0.227–0.310), and the distance of the nearest chunk on a
query CoCoA genuinely doesn't cover (0.277–0.346) all occupy essentially the
same band. There is no threshold that separates "nothing relevant exists"
from "something relevant exists but wasn't found" — confirmed live:
`RAG_MAX_DISTANCE=0.30` made e2e any-hit/precision/recall measurably worse
(0.72→0.56, 0.63→0.48, 0.67→0.51) while not improving abstention accuracy at
all (unchanged at 0.67 — the prompt's own "return an empty list" instruction
was already achieving that). `RAG_MAX_DISTANCE` therefore ships **unset by
design**: the plumbing exists (any future embedding/chunking improvement
might produce a cleaner separation), but the current retrieval quality
doesn't support it, and root-causing that is a chunking problem, not a
threshold-tuning problem (§10).

## 6. Generation: prompt and parsing

Both adapters share `src/generation/prompt.ts`:

- `buildSuggestionPrompt(query, passages)` renders the retrieved passages as
  numbered `[n] Code CIM-10 : <code> - <title>\n<text>` blocks and asks
  (in French, matching the source document and the target models) for a JSON
  object with a `suggestions` array, explicitly instructing the model to
  invent nothing and return an empty list when the context doesn't cover the
  query.
- `parseSuggestions(raw)` parses that JSON, drops any entry missing
  `code_icd10`, and coerces every field to a string (defensive against a
  model returning e.g. a number or `null` for an optional field). Unparseable
  output throws `GenerationError`, which `RAGService` maps to a `503` — a
  model/API failure is a service-availability problem, not a client error.

Keeping this logic in one shared module (rather than duplicated per adapter)
is what makes the model-swap A/B in `eval/run.py` meaningful: the only thing
that varies between an `ollama` and `openai` run is the model itself.

## 7. Auth

`POST /auth/login` exchanges a hard-coded demo account (`demo`/`demo`) for a
short-lived JWT (`@nestjs/jwt`, `JwtModule.register({ global: true, ... })`);
`JwtAuthGuard` guards `POST /suggest_code`. This is explicitly a
demonstration of the guard/login flow, not a security boundary: one account,
no user store, no password hashing. `GET /rag-health` stays public since it
carries no patient data and is useful for infra monitoring without auth.

## 8. Testing

45 Vitest tests across the ports/adapters and the orchestrator, all against
mocked ChromaDB/Ollama/axios boundaries — no live services needed for
`npm test`:

| Concern | Tests | What's checked |
|---|---|---|
| Input validation & auth | 13 | Symptom validation edge cases; JWT issue/reject; guard header parsing |
| Retrieval | 10 | Embedding-function HTTP contract + prefix handling; ChromaDB row mapping, caching, error wrapping |
| Generation | 11 | Shared prompt/parse logic (once); each adapter's own request shape, headers, HTTP-failure handling |
| Orchestration | 11 | Grounding logic, distance-cutoff filtering (§5), error→HTTP-status mapping, health reporting |

(Originally 50; trimmed 2026-09-13 after finding 5 tests that re-verified the
shared parser's behavior a second and third time through each adapter's mock,
rather than testing anything adapter-specific.)

**Known gap**: these are unit tests against mocked boundaries, not
integration tests against a live ChromaDB/Ollama/LLM. A live wiring break
(wrong port, model not pulled) wouldn't be caught by `npm test` — only by
`eval/run.py` or the manual smoke scripts (`python-src/test_rag_backend.py`).

## 9. Evaluation methodology

`eval/gold.jsonl` — 28 hand-annotated entries (25 graded, 3 abstain) covering
all 27 exercise inputs, each with acceptable CIM-10 code(s) (a 3-char family
root when any sub-code is acceptable, a full code when a specific one is
required) or an empty list meaning "the system should abstain." Two entries
are deliberately unanswerable-as-labeled: the medically correct code (`J14`,
Haemophilus influenzae pneumonia) doesn't exist as a chunk in the CoCoA
index, so they measure retrieval's honest limits rather than being softened
to whatever the index happens to contain.

`eval/run.py` has two modes:

- `--retrieval` queries ChromaDB directly (no backend needed) and reports
  Recall@k / MRR over the graded entries.
- (default) end-to-end, through `POST /suggest_code`, reporting any-hit /
  top-1 rate, mean precision/recall, abstention accuracy, grounded rate, and
  latency.

Current baseline (`cocoa_cim10_v2`, `qwen3-coder`, `RAG_MAX_DISTANCE` unset,
post-B5-stage-1 2026-09-13): Recall@5 **0.72**, MRR **0.597**, e2e any-hit
0.68, mean precision 0.573, mean recall 0.647, abstention accuracy 0.667,
grounded rate **0.976**. Retrieval improved clearly over the pre-fix baseline
(Recall@5 0.60→0.72); e2e was mixed (a couple of borderline codes reshuffled
out of top-5 now that ~3,900 more, previously-misfiled headings compete for
the same slots) — read as a data-correctness win whose full e2e payoff needs
a re-ranking or prompt pass, not a regression. Remaining failure analysis
still points at chunking (bare-symptom queries like "Fièvre" retrieve
confident-but-wrong chunks) — specifically the still-open mid-sentence
false-positive-heading case — see §11.

## 10. Known limitations

- **Chunking is still the weakest link, though less so since B5 stage 1**
  (2026-09-13): the `P R A` column-marker noise and the ~3,900
  previously-invisible headings it caused are fixed. What's left needs
  font-size info plain text extraction discards: a prose line that happens to
  start with a code-shaped token still gets mis-read as a new heading (e.g. a
  mid-sentence "F66" mention becomes its own bogus chunk). This is the direct
  cause of most remaining retrieval misses in §9, not a retrieval- or
  generation-algorithm problem.
- **No re-ranking or hybrid search.** Retrieval is pure vector kNN; a
  keyword/BM25 pass would likely help term-heavy medical queries (exact
  organism names, exact codes) that the embedding alone doesn't distinguish
  well.
- **No code hierarchy metadata.** Chunks aren't annotated with
  chapter/parent-code/block, so there's no way to expand a leaf code to
  siblings or browse by chapter.
- **CoCoA-scope-only by construction.** The system only ever suggests codes
  it can point to in the retrieved chunks' commentary; a real, correct code
  entirely absent from CoCoA (like the `J14` cases in the gold set) is
  structurally unreachable, not a bug to fix in this codebase.
- **Single-turn, no caching, no per-query logging/analytics.**
- **Demonstration-only auth** (§7).
- **Unit tests only** (§8) — no live-service integration tests.

## 11. Suggestions for improvement

- **Improve the chunking further** (§10) — the remaining false-positive
  splits are the main thing still holding retrieval quality back.
- **Hybrid search + re-ranking.** Vector similarity alone misses term-heavy
  queries (exact organism names, exact codes); a keyword pass plus a
  re-ranker over a wider candidate set would sharpen the close calls.
- **Code hierarchy metadata.** Chapter/parent-code/block, largely available
  for free from lines already being parsed — enables sibling-code expansion
  and browsing by chapter.
- **Few-shot prompting.** A worked example or two, including an explicit
  "no code found" case, would likely fix the inconsistent
  over-abstain/over-answer behavior the eval surfaced.
- **Benchmark alternative generation models.** The swap mechanism (§4)
  exists; `qwen3-coder` itself was never actually compared against
  alternatives.
- **A larger, cross-checked gold set** would sharpen every number in §9.
