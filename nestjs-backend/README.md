# RAG API Backend (NestJS)

REST API for the CoCoA / CIM-10 medical-coding RAG system. It embeds a short
clinical phrase, retrieves the closest CoCoA chunks from ChromaDB, and asks a
local LLM (via Ollama) to propose grounded CIM-10 codes.

## Architecture

```
POST /suggest_code {symptom}   (Authorization: Bearer <jwt from POST /auth/login>)
        │
        ▼  JwtAuthGuard
  AppController ─► RAGService  (orchestrator: retrieve → distance cutoff → suggest → mark grounded)
        │
        ├─► PassageRetriever port ─► ChromaPassageRetriever ─► ChromaDB HTTP server ─► rag_database/
        │       (query embedded via OLLAMA_EMBED_URL with nomic-embed-text, the
        │        SAME model used at indexing)
        │
        └─► CodeSuggester port ─► OllamaCodeSuggester   ─► Ollama /api/generate
        │                       │  (LLM_PROVIDER=ollama, default)
        │                       └─ OpenAiCodeSuggester   ─► {OPENAI_BASE_URL}/chat/completions
        │                          (LLM_PROVIDER=openai)     OpenAI / OpenRouter / Groq / local /v1 …
        ▼
  { query, suggestions: [{ code_icd10, description, justification, bonus_info, grounded }] }
```

ChromaDB and the suggestion LLM each sit behind an abstract-class port
(`src/retrieval/`, `src/generation/`), so they can be swapped or faked;
`RAGService` only orchestrates. Both suggestion adapters build the **same**
prompt (`src/generation/prompt.ts`) so their outputs stay comparable.

`grounded` is `true` when the suggested code was among the retrieved chunks;
`false` flags a code the LLM pulled from chunk *commentary* (a CoCoA coding rule)
or, less desirably, invented.

## Why a ChromaDB server?

`../python-src/chunkize_new.py` writes an **embedded** `PersistentClient` database to
`../rag_database`. The `chromadb` JS client only speaks HTTP, so a server has to
be run on top of that same directory. `npm run chroma` does exactly that.

## Requirements

- **Node.js >= 22** — `@nestjs/common` v12 ships `"type": "module"` (ESM-only,
  no CJS build); this app compiles to CommonJS (`tsconfig.json`) and relies on
  Node's native `require(esm)` interop, which is unflagged only from Node 22.12.
  On Node 18/20 `require('@nestjs/common')` throws `ERR_REQUIRE_ESM`. Matches
  the `node:22-alpine` base image in `Dockerfile`.
- Ollama running locally with the models pulled:
  ```bash
  ollama pull nomic-embed-text        # embeddings (768-dim) - must match indexing
  ollama pull qwen3-coder             # generation
  ```
- The ChromaDB CLI (ships with the Python `chromadb` package used for indexing):
  ```bash
  pip install chromadb
  ```
- `../rag_database` populated by the Python indexer.

## Run

Three processes (three terminals):

```bash
# 1. Ollama
ollama serve

# 2. ChromaDB server over the indexed database  (http://localhost:8000)
cd nestjs-backend && npm run chroma

# 3. The API + test UI                           (http://localhost:3000)
cd nestjs-backend && npm install && npm run dev
```

Then open the test UI at **http://localhost:3000/** — a single static page
(`public/index.html`, no build step) with an input box, the exercise example
phrases as one-click chips, a live health indicator, and result cards showing
each code, its justification, the CoCoA bonus info, and a "non ancré" flag when
the LLM proposes a code that was not among the retrieved chunks.

Or check wiring from the shell:

```bash
curl http://localhost:3000/rag-health
# {"chroma":true,"chunks":8919,"collection":"cocoa_cim10_v2"}
```

### Docker

From the repo root, `docker compose up --build` starts ChromaDB
(`chroma.Dockerfile`, mounting `../rag_database`), a small **embedding-only**
Ollama (`ollama-embed.Dockerfile`, `nomic-embed-text` baked in at build time —
274 MB, no host setup needed) and this service (`Dockerfile`, multi-stage: `tsc`
build then a slim runtime). The backend reaches embeddings at
`OLLAMA_EMBED_URL=http://ollama-embed:11434`.

**Retrieval works out of the box. Generation does not** — the model
(`qwen3-coder` or whatever you point it at) is multi-GB, so it's never
containerised, and `docker-compose.yml`'s `backend.environment` block **must**
name a real, reachable LLM endpoint or every `POST /suggest_code` will 503.
The shipped default is:

```yaml
LLM_PROVIDER: openai
OPENAI_BASE_URL: http://host.docker.internal:11434/v1
LLM_MODEL: qwen3-coder:latest
```

i.e. call the **host's** Ollama through its OpenAI-compatible `/v1` endpoint
(every Ollama install exposes this automatically, no extra flag) rather than
Ollama's own `/api/generate`. It needs no API key, but it does need Ollama
actually installed and running on the host with `qwen3-coder` pulled — see
"Setting up local Ollama" below if that isn't done yet. Two alternatives are
commented right below it in `docker-compose.yml`: point `OPENAI_BASE_URL` /
`OPENAI_API_KEY` / `LLM_MODEL` at a real hosted API instead (skips host Ollama
entirely), or set `LLM_PROVIDER: ollama` to use Ollama's native
`/api/generate` adapter instead of its `/v1` one.

Building the index is a separate, opt-in step —
`docker compose --profile indexer run --rm indexer` (see the root README) —
gated behind a Compose profile so it never runs as part of `docker compose up`.

### Setting up local Ollama (for generation)

Only needed if you have no hosted LLM API key — i.e. you're using the shipped
Docker default (`LLM_PROVIDER=openai` pointed at a local Ollama) or
`LLM_PROVIDER=ollama`. Skip entirely if you've pointed `OPENAI_BASE_URL` /
`OPENAI_API_KEY` at a real hosted API instead.

```bash
../setup-ollama.sh          # from nestjs-backend/, or ./setup-ollama.sh from the repo root
```

Installs Ollama if it's missing (Homebrew on macOS, the official install
script on Linux), starts `ollama serve` if it isn't already running, pulls
`qwen3-coder` (plus `nomic-embed-text`, needed only if you also run the
backend outside Docker — `SKIP_EMBED_MODEL=1 ./setup-ollama.sh` to skip it),
and finishes with a smoke-test generation call through the same
OpenAI-compatible endpoint the Docker default uses. Every step checks whether
it's already done first, so it's safe to re-run.

By hand, that script is just:

```bash
brew install ollama             # macOS; or https://ollama.com/download
ollama serve                    # starts the Ollama server on :11434
ollama pull qwen3-coder         # generation model, several GB
ollama pull nomic-embed-text    # embeddings, only needed outside Docker
```

Verify it's reachable and the model is there:

```bash
curl http://localhost:11434/api/tags | grep qwen3-coder
```

That's the whole setup — `ollama serve` also exposes the OpenAI-compatible
`/v1/chat/completions` endpoint the Docker default calls, with no further
configuration.

## Configuration

All via environment variables (defaults in `src/config.ts`):

| Variable             | Default                  | Purpose                                          |
|----------------------|--------------------------|-------------------------------------------------|
| `PORT`               | `3000`                   | API port                                        |
| `CHROMA_URL`         | `http://localhost:8000`  | ChromaDB server                                 |
| `CHROMA_COLLECTION`  | `cocoa_cim10_v2`         | Collection name                                 |
| `OLLAMA_URL`         | `http://localhost:11434` | Ollama server for **generation** (`LLM_PROVIDER=ollama`) |
| `OLLAMA_EMBED_URL`   | same as `OLLAMA_URL`     | Ollama server for **retrieval** query embeddings; defaults to `OLLAMA_URL` so one local Ollama serves both |
| `EMBED_MODEL`        | `nomic-embed-text:latest`| Query embedding model (match indexing!)         |
| `EMBED_QUERY_PREFIX` | `search_query: `         | nomic task prefix (see below)                   |
| `LLM_PROVIDER`       | `ollama` (code); `openai` in `docker-compose.yml` | Suggestion LLM backend: `ollama` or `openai` |
| `LLM_MODEL`          | `qwen3-coder:latest`     | Suggestion model name                           |
| `LLM_TIMEOUT_MS`     | `120000`                 | Generation request timeout                      |
| `OPENAI_BASE_URL`    | `https://api.openai.com/v1` (code); `http://host.docker.internal:11434/v1` in `docker-compose.yml` | `openai` provider: Chat Completions base URL |
| `OPENAI_API_KEY`     | _(empty)_                | `openai` provider: bearer token (omit for local /v1) |
| `RAG_N_RESULTS`      | `5`                      | Chunks retrieved per query                      |
| `RAG_MAX_DISTANCE`   | _(unset)_                | Drop retrieved chunks past this cosine distance |
| `JWT_SECRET`         | `dev-secret-change-me`   | HMAC secret for the demo auth token             |
| `JWT_TTL_SECONDS`    | `3600`                   | Token lifetime                                  |
| `AUTH_USER` / `AUTH_PASSWORD` | `demo` / `demo` | The single demo account                         |

The embedding model **and** its task prefix must match how the target collection
was indexed. Two collections exist in `rag_database/`:

- **`cocoa_cim10_v2`** (default) — indexed with nomic `search_document: ` /
  `search_query: ` prefixes, cosine distance. Needs `EMBED_QUERY_PREFIX=
  "search_query: "` (the default). Beat `cocoa_cim10` on the 28-entry gold set
  (retrieval MRR +0.12, e2e any-hit +0.12); see `../TECHNICAL.md` §5.
- **`cocoa_cim10`** — prefix-free, L2 distance. Use
  `CHROMA_COLLECTION=cocoa_cim10 EMBED_QUERY_PREFIX=""`.

`RAG_MAX_DISTANCE` only makes sense against `cocoa_cim10_v2` (bounded cosine
distances, 0..2). Left **unset by design, not just untuned**: a sweep against
the 28-entry gold set (`eval/run.py`) found that correctly-retrieved,
incorrectly-retrieved and should-abstain queries all land in the same
0.17–0.38 distance band, so no cutoff value helps — see `../TECHNICAL.md` §5.

### Choosing the suggestion model

The **embedding** model is fixed by the index and is unrelated to this. The
**suggestion** LLM has two interchangeable adapters, picked at boot by
`LLM_PROVIDER` (restart to change). `ollama` is the code-level default
(`src/config.ts`, what you get running `npm run dev` with no env set) — but
`docker-compose.yml` explicitly sets `LLM_PROVIDER=openai` for the Docker
stack (see "Docker" above), so the *effective* default differs depending on
how you run it:

- **`ollama`** (code default; local `npm run dev` with no env) —
  `POST {OLLAMA_URL}/api/generate`, `LLM_MODEL` names the Ollama model. Zero
  config for local dev.
- **`openai`** — `POST {OPENAI_BASE_URL}/chat/completions` (the OpenAI wire
  format). `OPENAI_BASE_URL` selects the actual backend:

  | Backend | `OPENAI_BASE_URL` | `LLM_MODEL` example |
  |---|---|---|
  | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
  | OpenRouter (any model) | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4.5`, `openai/gpt-4o-mini` |
  | Groq / Together / Fireworks / DeepSeek | their `/v1` URL | provider-specific |
  | local Ollama / vLLM / LM Studio | `http://localhost:11434/v1` | `qwen3-coder:latest` (no key) |

  Set `OPENAI_API_KEY` for hosted backends; omit it for a local `/v1`.

Both adapters send the identical French prompt (`src/generation/prompt.ts`) and
run through the same parser, so `eval/run.py` measures a model swap directly.

## API

### `GET /rag-health` — public
Reports whether the ChromaDB collection is reachable and its chunk count.

### `POST /auth/login` — public

```json
{ "username": "demo", "password": "demo" }   →   { "access_token": "<jwt>" }
```

Demonstration auth only: one hard-coded account, no user store, no password
hashing. `401` on bad credentials.

### `POST /suggest_code` — requires `Authorization: Bearer <jwt>`

```json
{ "symptom": "Fibrillation auriculaire" }
```

```json
{
  "query": "Fibrillation auriculaire",
  "suggestions": [
    {
      "code_icd10": "I48.0",
      "description": "Fibrillation auriculaire paroxystique",
      "justification": "...",
      "bonus_info": "...",
      "grounded": true
    }
  ]
}
```

`symptom` is required and capped at 100 characters. `401` without a valid token;
`503` if ChromaDB or Ollama is unreachable.

```bash
TOKEN=$(curl -s -XPOST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"username":"demo","password":"demo"}' | jq -r .access_token)
curl -s -XPOST localhost:3000/suggest_code -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"symptom":"Tachycardie"}'
```

## Tests

```bash
npm test          # unit tests (Vitest)
npm run test:watch
```

45 tests: `RAGService` orchestration + grounding (plain fakes for the two
ports), the shared `prompt` module (parsing/coercion tested once, here, not
re-verified per adapter), `ChromaPassageRetriever` / `OllamaCodeSuggester` /
`OpenAiCodeSuggester` (chromadb / axios mocked; each adapter spec covers only
what's specific to it — request shape, headers, HTTP-failure handling),
`OllamaEmbeddingFunction`, `AppController` validation, and `AuthService` /
`JwtAuthGuard`. No servers needed. Vitest is used rather than
Jest because `@nestjs/common` v12 ships ESM-only, which Jest cannot load without
heavy config.

## Dev tooling

```bash
npx ts-node scripts/debug-retrieve.ts "Hyponatrémie"   # inspect raw retrieval
```

## Known limitations

- Retrieval quality is bounded by the current chunking: chunks carry PDF
  artefacts (`P R A`, page headers) and some titles are mis-captured by the
  code-line regex. CoCoA only covers *commented* codes, so queries outside that
  scope (e.g. plain "Toux") legitimately return no suggestions.
- No re-ranking / hybrid search yet.
- Single-turn, no caching, no per-query logging.
- Auth is demonstration-only (see `POST /auth/login` above — one hard-coded
  account, no user store or password hashing).
- Unit tests only (no end-to-end / integration tests against live services).
