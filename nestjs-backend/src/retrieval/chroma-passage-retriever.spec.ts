import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('chromadb', () => ({
  ChromaClient: vi.fn(),
  IncludeEnum: {
    Documents: 'documents',
    Metadatas: 'metadatas',
    Distances: 'distances',
  },
}));
// OllamaEmbeddingFunction (constructed in a field initializer) imports axios.
vi.mock('axios', () => ({ default: { post: vi.fn() } }));

import { Logger } from '@nestjs/common';
import { ChromaClient } from 'chromadb';

import { RetrieverUnavailableError } from '../errors';
import { ChromaPassageRetriever } from './chroma-passage-retriever';

const mockedChromaClient = ChromaClient as unknown as Mock;

const queryResult = (codes: string[], distances?: number[]) => ({
  documents: [codes.map((c) => `${c} - text`)],
  metadatas: [codes.map((c) => ({ code_cim10: c, titre: `title ${c}` }))],
  distances: [distances ?? codes.map(() => 0.1)],
});

describe('ChromaPassageRetriever', () => {
  let retriever: ChromaPassageRetriever;
  let getCollection: Mock;
  let collection: { query: Mock; count: Mock };

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    collection = { query: vi.fn(), count: vi.fn().mockResolvedValue(8919) };
    getCollection = vi.fn().mockResolvedValue(collection);
    mockedChromaClient.mockImplementation(() => ({ getCollection }));

    retriever = new ChromaPassageRetriever();
  });

  it('maps ChromaDB rows to RetrievedChunk (code, title, text, distance)', async () => {
    collection.query.mockResolvedValue(queryResult(['I48.0', 'I48.1'], [0.2, 0.3]));

    const chunks = await retriever.retrieve('Fibrillation auriculaire', 5);

    expect(chunks).toEqual([
      { code: 'I48.0', title: 'title I48.0', text: 'I48.0 - text', distance: 0.2 },
      { code: 'I48.1', title: 'title I48.1', text: 'I48.1 - text', distance: 0.3 },
    ]);
    expect(collection.query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryTexts: ['Fibrillation auriculaire'],
        nResults: 5,
        include: ['documents', 'metadatas', 'distances'],
      }),
    );
  });

  it('resolves the collection once and reuses it', async () => {
    collection.query.mockResolvedValue(queryResult(['J18.1']));

    await retriever.retrieve('a', 5);
    await retriever.retrieve('b', 5);

    expect(getCollection).toHaveBeenCalledTimes(1);
  });

  it('throws RetrieverUnavailableError when the collection cannot be resolved', async () => {
    getCollection.mockRejectedValue(new Error('no such collection'));

    await expect(retriever.retrieve('a', 5)).rejects.toBeInstanceOf(
      RetrieverUnavailableError,
    );
  });

  it('throws RetrieverUnavailableError when the query fails', async () => {
    collection.query.mockRejectedValue(new Error('connection refused'));

    await expect(retriever.retrieve('a', 5)).rejects.toBeInstanceOf(
      RetrieverUnavailableError,
    );
  });

  it('count() returns the collection size', async () => {
    await expect(retriever.count()).resolves.toBe(8919);
  });

  it('onModuleInit does not throw when ChromaDB is unreachable', async () => {
    getCollection.mockRejectedValue(new Error('down'));

    await expect(retriever.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
