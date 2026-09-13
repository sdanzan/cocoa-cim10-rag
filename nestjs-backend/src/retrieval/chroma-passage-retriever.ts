import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChromaClient, Collection, IncludeEnum } from 'chromadb';

import { config } from '../config';
import { RetrieverUnavailableError } from '../errors';
import { OllamaEmbeddingFunction } from './ollama-embedding.function';
import { PassageRetriever, RetrievedChunk } from './passage-retriever';

/** `PassageRetriever` backed by a ChromaDB HTTP server + Ollama embeddings. */
@Injectable()
export class ChromaPassageRetriever
  extends PassageRetriever
  implements OnModuleInit
{
  private readonly logger = new Logger(ChromaPassageRetriever.name);

  private readonly client = new ChromaClient({ path: config.chroma.url });
  private readonly embedder = new OllamaEmbeddingFunction(
    config.ollama.embedUrl,
    config.ollama.embedModel,
    config.ollama.embedQueryPrefix,
  );

  private collection?: Collection;

  /** Connect on startup so a misconfigured ChromaDB fails loudly, not on the first request. */
  async onModuleInit(): Promise<void> {
    try {
      const count = await (await this.getCollection()).count();
      this.logger.log(
        `Connected to ChromaDB at ${config.chroma.url} - collection "${config.chroma.collection}" (${count} chunks).`,
      );
    } catch (err) {
      // Do not rethrow: let the app start so GET /rag-health can report the problem.
      this.logger.error(
        `Cannot reach ChromaDB at ${config.chroma.url}. Start it with "npm run chroma". Cause: ${(err as Error).message}`,
      );
    }
  }

  async count(): Promise<number> {
    return (await this.getCollection()).count();
  }

  async retrieve(query: string, nResults: number): Promise<RetrievedChunk[]> {
    let collection: Collection;
    try {
      collection = await this.getCollection();
    } catch {
      throw new RetrieverUnavailableError(
        `ChromaDB is not reachable at ${config.chroma.url}. Run "npm run chroma".`,
      );
    }

    let results;
    try {
      results = await collection.query({
        queryTexts: [query],
        nResults,
        include: [
          IncludeEnum.Documents,
          IncludeEnum.Metadatas,
          IncludeEnum.Distances,
        ],
      });
    } catch (err) {
      throw new RetrieverUnavailableError(
        `ChromaDB query failed: ${(err as Error).message}`,
      );
    }

    const documents = results.documents?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];
    const distances = results.distances?.[0] ?? [];

    return documents.map((text, i) => ({
      text: (text ?? '').trim(),
      code: (metadatas[i]?.code_cim10 as string) ?? 'N/A',
      title: (metadatas[i]?.titre as string) ?? '',
      distance: distances[i] ?? Infinity,
    }));
  }

  /** Lazily resolve the collection handle and cache it for reuse. */
  private async getCollection(): Promise<Collection> {
    if (!this.collection) {
      this.collection = await this.client.getCollection({
        name: config.chroma.collection,
        embeddingFunction: this.embedder,
      });
    }
    return this.collection;
  }
}
