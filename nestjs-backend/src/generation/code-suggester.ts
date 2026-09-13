import type { RetrievedChunk } from '../retrieval/passage-retriever';

/** A raw CIM-10 suggestion from the model, before grounding is checked. */
export interface RawSuggestion {
  code_icd10: string;
  description: string;
  justification: string;
  bonus_info: string;
}

/**
 * Generation side of the RAG pipeline: ask the model for CIM-10 suggestions
 * grounded in the given passages. Declared as an abstract class so it doubles
 * as the NestJS injection token (see `app.module.ts`).
 */
export abstract class CodeSuggester {
  abstract suggest(
    query: string,
    passages: RetrievedChunk[],
  ): Promise<RawSuggestion[]>;
}
