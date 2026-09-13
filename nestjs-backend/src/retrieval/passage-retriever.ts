/** A CoCoA passage retrieved for a query, with its vector distance. */
export interface RetrievedChunk {
  /** CIM-10 code the passage documents, e.g. "J18.1". */
  code: string;
  /** Code label. */
  title: string;
  /** Passage text (the code line plus its expert commentary). */
  text: string;
  /** Distance from the query in the collection's space (cosine: 0..2). */
  distance: number;
}

/**
 * Retrieval side of the RAG pipeline: turn a query string into the nearest
 * CoCoA passages. Declared as an abstract class so it doubles as the NestJS
 * injection token (see `app.module.ts`).
 */
export abstract class PassageRetriever {
  abstract retrieve(query: string, nResults: number): Promise<RetrievedChunk[]>;

  /** Number of indexed passages; also serves as a reachability probe. */
  abstract count(): Promise<number>;
}
