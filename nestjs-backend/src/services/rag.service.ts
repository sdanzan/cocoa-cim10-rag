import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { config } from '../config';
import { GenerationError, RetrieverUnavailableError } from '../errors';
import { CodeSuggester } from '../generation/code-suggester';
import { PassageRetriever, RetrievedChunk } from '../retrieval/passage-retriever';
import { RagResponseDto } from '../dto/rag-response.dto';

/**
 * Orchestrates the RAG pipeline: retrieve CoCoA passages, apply the distance
 * cutoff, ask the model for codes, then flag which ones were actually in the
 * retrieved context. ChromaDB and Ollama live behind `PassageRetriever` and
 * `CodeSuggester`.
 */
@Injectable()
export class RAGService {
  constructor(
    private readonly retriever: PassageRetriever,
    private readonly suggester: CodeSuggester,
  ) {}

  async health(): Promise<{ chroma: boolean; chunks?: number; collection: string }> {
    try {
      const chunks = await this.retriever.count();
      return { chroma: true, chunks, collection: config.chroma.collection };
    } catch {
      return { chroma: false, collection: config.chroma.collection };
    }
  }

  async suggestCodes(symptom: string): Promise<RagResponseDto> {
    try {
      const passages = this.withinThreshold(
        await this.retriever.retrieve(symptom, config.retrieval.nResults),
      );
      if (passages.length === 0) {
        return { query: symptom, suggestions: [] };
      }

      const retrievedCodes = new Set(passages.map((p) => p.code));
      const suggestions = (await this.suggester.suggest(symptom, passages)).map(
        (s) => ({ ...s, grounded: retrievedCodes.has(s.code_icd10) }),
      );
      return { query: symptom, suggestions };
    } catch (err) {
      if (
        err instanceof RetrieverUnavailableError ||
        err instanceof GenerationError
      ) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
  }

  /** B9: drop passages beyond the configured cosine-distance cutoff (if set). */
  private withinThreshold(passages: RetrievedChunk[]): RetrievedChunk[] {
    const { maxDistance } = config.retrieval;
    if (maxDistance === undefined) return passages;
    return passages.filter((p) => p.distance <= maxDistance);
  }
}
