import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

import { Logger } from '@nestjs/common';
import axios from 'axios';

import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { OllamaCodeSuggester } from './ollama-code-suggester';

const mockedPost = axios.post as unknown as Mock;

const llmResponse = (suggestions: unknown[]) => ({
  data: { response: JSON.stringify({ query: 'x', suggestions }) },
});

const chunk = (code: string): RetrievedChunk => ({
  code,
  title: `title ${code}`,
  text: `${code} text`,
  distance: 0.1,
});

const suggestion = (code: string) => ({
  code_icd10: code,
  description: `desc ${code}`,
  justification: 'y',
  bonus_info: '',
});

describe('OllamaCodeSuggester', () => {
  let suggester: OllamaCodeSuggester;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    suggester = new OllamaCodeSuggester();
  });

  it('builds a JSON prompt containing the query and passages, returns parsed suggestions', async () => {
    mockedPost.mockResolvedValue(llmResponse([suggestion('I48.0')]));

    const result = await suggester.suggest('Fibrillation auriculaire', [chunk('I48.0')]);

    expect(result).toEqual([suggestion('I48.0')]);
    const body = mockedPost.mock.calls[0][1];
    expect(body.prompt).toContain('I48.0');
    expect(body.prompt).toContain('Fibrillation auriculaire');
    expect(body.format).toBe('json');
    expect(body.options).toEqual({ temperature: 0 });
  });

  it('throws GenerationError when the HTTP call fails', async () => {
    mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      suggester.suggest('x', [chunk('J18.1')]),
    ).rejects.toBeInstanceOf(GenerationError);
  });
});
