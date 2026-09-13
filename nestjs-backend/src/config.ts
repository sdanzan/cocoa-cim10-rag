/**
 * Runtime configuration. Every external dependency is addressed through an
 * environment variable so the same build runs locally, in Docker or in CI.
 */
export const config = {
  http: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },

  chroma: {
    // A *running* ChromaDB HTTP server (see `npm run chroma`). The JS client
    // cannot open the embedded database that the Python indexer writes.
    url: process.env.CHROMA_URL ?? 'http://localhost:8000',
    // `cocoa_cim10_v2`: nomic task prefixes + cosine distance. Beat the
    // prefix-free `cocoa_cim10` on the 28-entry gold set (retrieval MRR +0.12,
    // e2e any-hit +0.12); see ../TECHNICAL.md §5.
    collection: process.env.CHROMA_COLLECTION ?? 'cocoa_cim10_v2',
  },

  // Ollama serves the query embeddings for retrieval (see chroma-passage-retriever)
  // and, by default, the suggestion LLM (see the `llm` block below). These can
  // be two different servers (e.g. Docker: a small containerized Ollama for
  // embeddings, the host's Ollama for generation) - `embedUrl` defaults to
  // `url` so a single local Ollama still serves both with no extra config.
  ollama: {
    url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    embedUrl:
      process.env.OLLAMA_EMBED_URL ?? process.env.OLLAMA_URL ?? 'http://localhost:11434',
    // Must match the model used by python-src/chunkize_new.py at indexing time,
    // otherwise query and stored vectors live in different spaces.
    embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text:latest',
    // nomic-embed task prefix for the query side. Must match how the target
    // collection was indexed: "search_query: " for the default `cocoa_cim10_v2`,
    // '' for the prefix-free `cocoa_cim10`.
    embedQueryPrefix: process.env.EMBED_QUERY_PREFIX ?? 'search_query: ',
  },

  // The suggestion LLM (generation half of the RAG pipeline).
  llm: {
    // 'ollama' -> OllamaCodeSuggester, POST {OLLAMA_URL}/api/generate.
    // 'openai' -> OpenAiCodeSuggester, POST {OPENAI_BASE_URL}/chat/completions;
    //             point OPENAI_BASE_URL at OpenAI, OpenRouter, Groq, Together,
    //             Anthropic's /v1/ compatible endpoint, or a local Ollama /v1.
    provider: (process.env.LLM_PROVIDER ?? 'ollama') as 'ollama' | 'openai',
    model: process.env.LLM_MODEL ?? 'qwen3-coder:latest',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS ?? '120000', 10),
    openai: {
      baseUrl: (
        process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
      ).replace(/\/+$/, ''),
      apiKey: process.env.OPENAI_API_KEY ?? '',
    },
  },

  retrieval: {
    nResults: parseInt(process.env.RAG_N_RESULTS ?? '5', 10),
    // Drop retrieved chunks whose distance exceeds this (cosine space: 0..2).
    // Unset = keep all. Tune against eval/run.py once the gold set is larger.
    maxDistance: process.env.RAG_MAX_DISTANCE
      ? parseFloat(process.env.RAG_MAX_DISTANCE)
      : undefined,
  },

  // Demonstration JWT auth on POST /suggest_code. A single hard-coded account,
  // no user store, no password hashing - enough to show the guard/login flow.
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    tokenTtlSeconds: parseInt(process.env.JWT_TTL_SECONDS ?? '3600', 10),
    username: process.env.AUTH_USER ?? 'demo',
    password: process.env.AUTH_PASSWORD ?? 'demo',
  },
} as const;
