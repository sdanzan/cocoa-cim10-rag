# CoCoA RAG — CIM-10 medical coding assistant

A Retrieval-Augmented Generation system that suggests CIM-10 (ICD-10, French
PMSI) codes for a short clinical phrase, grounded in the expert-annotated
**CoCoA** document.

Given an input such as *"patient présentant une dyspnée"*, it returns one or
more CIM-10 code suggestions extracted from CoCoA, each with a short
justification and any extra coding guidance found in the document.

See [`TECHNICAL.md`](TECHNICAL.md) for the RAG theory, architecture rationale,
and known limitations behind this README's quickstart (Mermaid renders of its
diagrams are in [`ARCHITECTURE-DIAGRAMS-MERMAID.md`](ARCHITECTURE-DIAGRAMS-MERMAID.md)).

## Repository layout

| Path | What it is |
|------|------------|
| `python-src/chunkize_new.py` | Parses `CoCoA.pdf` into one chunk per CIM-10 code, embeds each chunk with Ollama (`nomic-embed-text`) and stores it in a persistent ChromaDB collection under `rag_database/`. |
| `python-src/test_rag.py` | Reference RAG pipeline calling ChromaDB + Ollama directly (no backend). |
| `python-src/test_rag_backend.py` | Same example set, driven through the NestJS API. |
| `nestjs-backend/` | REST API (`POST /suggest_code`) + a static test UI. See its own [README](nestjs-backend/README.md). |
| `eval/` | Gold set + harness measuring retrieval and end-to-end quality. See its own [README](eval/README.md). |
| `rag_database/` | The ChromaDB database produced by the indexer. |
| `docker-compose.yml`, `chroma.Dockerfile`, `ollama-embed.Dockerfile`, `indexer.Dockerfile`, `nestjs-backend/Dockerfile` | Containerised ChromaDB + embedding-only Ollama + indexer (opt-in) + API/UI. The generation model stays on the host or hosted — see [`nestjs-backend/README.md`](nestjs-backend/README.md#choosing-the-suggestion-model). |
| `setup-ollama.sh` | Installs Ollama and pulls `qwen3-coder` (+ `nomic-embed-text`) — for anyone with no hosted LLM API key. Idempotent, safe to re-run. |

## Pipeline

```
CoCoA.pdf
   │  chunkize_new.py  (split by CIM-10 code → embed → store)
   ▼
rag_database/  (ChromaDB, collection "cocoa_cim10_v2")
   │  served over HTTP by `chroma run`
   ▼
NestJS backend  ──►  retrieval (nomic-embed-text)  ──►  generation (qwen3-coder, JSON)
   ▼
{ query, suggestions: [{ code_icd10, description, justification, bonus_info, grounded }] }
```

## 1. Build the index (once)

Two ways to run the indexer — containerized (no local Ollama/Python needed) or
on the host:

```bash
# Containerized: builds a small embedding-only Ollama image, then indexes.
# Run with `chroma`/`backend` stopped (chunkize_new.py writes rag_database/
# directly and must not race the chroma HTTP server over the same files).
docker compose --profile indexer run --rm indexer

# Host:
ollama serve
ollama pull nomic-embed-text
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python python-src/chunkize_new.py            # writes rag_database/
```

## 2. Run the API + UI

### With Docker

```bash
docker compose up --build             # ChromaDB + embedding Ollama + API/UI
```

Then open http://localhost:3000/. **Retrieval** needs no host Ollama —
embeddings run in the small `ollama-embed` container (`nomic-embed-text`,
274 MB, baked into the image).

**Generation is not containerised** (the model is multi-GB) and needs a
properly configured LLM endpoint or `/suggest_code` will 503. The shipped
default calls the **host's** Ollama through its OpenAI-compatible `/v1`
endpoint — no API key, but Ollama must actually be installed and running.
If you have no hosted LLM API key:

```bash
./setup-ollama.sh      # installs Ollama if missing, pulls qwen3-coder, verifies
```

See [`nestjs-backend/README.md`](nestjs-backend/README.md#setting-up-local-ollama-for-generation)
for what the script does and the manual steps, or swap `docker-compose.yml`'s `OPENAI_BASE_URL` /
`OPENAI_API_KEY` / `LLM_MODEL` to point at a real hosted API instead and skip
host Ollama entirely.

### Without Docker

See [`nestjs-backend/README.md`](nestjs-backend/README.md). In short:

```bash
cd nestjs-backend
npm install
npm run chroma      # ChromaDB server over ../rag_database  (terminal 2)
npm run dev         # API + UI on http://localhost:3000    (terminal 3)
```

Open http://localhost:3000/ for the test UI (log in with `demo` / `demo` — the
`POST /suggest_code` endpoint is JWT-guarded), or:

```bash
python python-src/test_rag_backend.py "Fibrillation auriculaire"   # logs in automatically
```

## 3. Evaluate

```bash
python eval/run.py                    # end-to-end quality (needs the backend)
python eval/run.py --retrieval --k 5  # retrieval quality (needs rag_database/)
```

Metrics and gold-set format in [`eval/README.md`](eval/README.md).
