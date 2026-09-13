/**
 * Errors raised by the infrastructure adapters. They are framework-free; the
 * orchestrator (`RAGService`) maps them to HTTP responses.
 */

/** The retrieval backend (ChromaDB) is unreachable or a query failed. */
export class RetrieverUnavailableError extends Error {}

/** The language model call failed or returned an unusable response. */
export class GenerationError extends Error {}
