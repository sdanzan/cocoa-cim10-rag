import axios from 'axios';
import { IEmbeddingFunction } from 'chromadb';

/**
 * ChromaDB embedding function backed by a local Ollama server.
 *
 * `chromadb` ships an `OllamaEmbeddingFunction`, but it depends on the optional
 * `ollama` npm package (not installed here) and defaults to a different model.
 * This implementation talks to the same `POST /api/embeddings` endpoint that the
 * Python indexing script uses, guaranteeing that query vectors and stored
 * vectors are produced identically.
 *
 * `prefix` is a task prefix prepended to every text before embedding (nomic-embed
 * expects `search_query: ` at query time, matching the `search_document: ` the
 * indexer uses). Pass `''` for a prefix-free index.
 */
export class OllamaEmbeddingFunction implements IEmbeddingFunction {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly prefix = '',
  ) {}

  async generate(texts: string[]): Promise<number[][]> {
    // `/api/embeddings` accepts a single prompt per call, so embed sequentially.
    // Query traffic embeds one short string at a time, so this is not a bottleneck.
    const embeddings: number[][] = [];
    for (const text of texts) {
      const { data } = await axios.post(
        `${this.baseUrl}/api/embeddings`,
        { model: this.model, prompt: this.prefix + text },
        { timeout: 30_000 },
      );

      if (!Array.isArray(data?.embedding) || data.embedding.length === 0) {
        throw new Error(
          `Ollama returned no embedding for model "${this.model}". Is the model pulled ("ollama pull ${this.model}")?`,
        );
      }
      embeddings.push(data.embedding);
    }
    return embeddings;
  }
}
