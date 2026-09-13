import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

import axios from 'axios';

import { OllamaEmbeddingFunction } from './ollama-embedding.function';

const mockedPost = axios.post as unknown as Mock;

describe('OllamaEmbeddingFunction', () => {
  const ef = new OllamaEmbeddingFunction('http://ollama:11434', 'nomic-embed-text:latest');

  it('POSTs each text to /api/embeddings and returns the vectors in order', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { embedding: [1, 2, 3] } })
      .mockResolvedValueOnce({ data: { embedding: [4, 5, 6] } });

    const vectors = await ef.generate(['a', 'b']);

    expect(vectors).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(mockedPost).toHaveBeenNthCalledWith(
      1,
      'http://ollama:11434/api/embeddings',
      { model: 'nomic-embed-text:latest', prompt: 'a' },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('throws a helpful error when Ollama returns no embedding', async () => {
    mockedPost.mockResolvedValue({ data: {} });

    await expect(ef.generate(['a'])).rejects.toThrow('nomic-embed-text:latest');
  });

  it('throws when the embedding array is empty', async () => {
    mockedPost.mockResolvedValue({ data: { embedding: [] } });

    await expect(ef.generate(['a'])).rejects.toThrow(/embedding/i);
  });

  it('prepends the task prefix to the prompt when one is configured', async () => {
    const prefixed = new OllamaEmbeddingFunction(
      'http://ollama:11434',
      'nomic-embed-text:latest',
      'search_query: ',
    );
    mockedPost.mockResolvedValue({ data: { embedding: [1] } });

    await prefixed.generate(['Fièvre']);

    expect(mockedPost).toHaveBeenCalledWith(
      'http://ollama:11434/api/embeddings',
      { model: 'nomic-embed-text:latest', prompt: 'search_query: Fièvre' },
      expect.anything(),
    );
  });
});
