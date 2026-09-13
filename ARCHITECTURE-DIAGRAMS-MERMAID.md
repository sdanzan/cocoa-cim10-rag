# Architecture diagrams (Mermaid)

Mermaid versions of the two diagrams in [`TECHNICAL.md`](TECHNICAL.md#3-architecture)
§3, kept in their own file so they render on viewers that support Mermaid
(GitHub, most Markdown editors) without depending on it — `TECHNICAL.md` keeps
the plain-ASCII versions as the primary reference.

## Request pipeline

```mermaid
flowchart TD
    PDF["CoCoA.pdf"] -->|"chunkize_new.py<br/>split per CIM-10 code + commentary,<br/>embed with nomic-embed-text"| DB[("rag_database/<br/>ChromaDB · cocoa_cim10_v2<br/>12,817 chunks")]
    DB -->|"served over HTTP by chroma run"| Ctrl

    subgraph Backend["NestJS backend"]
        Ctrl["AppController<br/>POST /suggest_code, JWT-guarded<br/>body carries the symptom text"] --> Svc["RAGService orchestrator"]

        Svc -->|"1. retrieve top-5 passages"| Retriever["PassageRetriever port<br/>→ ChromaPassageRetriever"]
        Retriever -->|"embed query, nomic-embed-text<br/>+ task prefix, then kNN query"| DB

        Svc -->|"2. drop chunks past<br/>RAG_MAX_DISTANCE, unset, see TECHNICAL.md §5"| Filter{"any passages<br/>left?"}
        Filter -->|"no"| Empty["empty result<br/>no LLM call"]
        Filter -->|"yes, 4. ask for suggestions"| Suggester["CodeSuggester port"]

        Suggester --> Ollama["OllamaCodeSuggester<br/>LLM_PROVIDER=ollama, code default"]
        Suggester --> OpenAI["OpenAiCodeSuggester<br/>LLM_PROVIDER=openai"]
        Ollama -.->|"shared prompt +<br/>parser"| Prompt["prompt.ts"]
        OpenAI -.->|"shared prompt +<br/>parser"| Prompt

        Ollama --> Ground["5. mark grounded when<br/>code was among retrieved chunks"]
        OpenAI --> Ground
    end

    Ground --> Resp["JSON response: query plus a<br/>suggestions array - code, description,<br/>justification, bonus info, grounded"]
    Empty --> Resp
```

## Deployment topology (Docker)

```mermaid
flowchart LR
    Model["nomic-embed-text<br/>274 MB"] -.->|"baked in at build time"| Embed
    Embed["ollama-embed<br/>embeddings only"] --> Backend

    subgraph Compose["docker compose"]
        Backend["backend"] <--> Chroma["chroma"]
        Indexer["indexer<br/>opt-in via Compose profile 'indexer'<br/>never runs on a bare 'up'"] -->|"writes, embedded client"| RagDB[("rag_database/")]
        Chroma ---|"serves, HTTP"| RagDB
        Indexer -.->|"must not run while<br/>chroma is up"| Chroma
        Embed --- Indexer
    end

    Backend -->|"LLM_PROVIDER=ollama, code default<br/>multi-GB, not containerized"| HostOllama["host Ollama"]
    Backend -.->|"LLM_PROVIDER=openai"| HostedAPI["hosted API -<br/>OpenAI, OpenRouter, Groq, ..."]
```
