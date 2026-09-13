import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

import { Logger } from '@nestjs/common';
import axios from 'axios';

import { config } from '../config';
import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { OpenAiCodeSuggester } from './openai-code-suggester';

const mockedPost = axios.post as unknown as Mock;

const chatResponse = (suggestions: unknown[]) => ({
  data: {
    choices: [
      { message: { content: JSON.stringify({ query: 'x', suggestions }) } },
    ],
  },
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

describe('OpenAiCodeSuggester', () => {
  let suggester: OpenAiCodeSuggester;
  const openai = config.llm.openai as { baseUrl: string; apiKey: string };
  let baseUrl: string;
  let apiKey: string;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    baseUrl = openai.baseUrl;
    apiKey = openai.apiKey;
    openai.baseUrl = 'https://api.example.com/v1';
    openai.apiKey = '';
    suggester = new OpenAiCodeSuggester();
  });
  afterEach(() => {
    openai.baseUrl = baseUrl;
    openai.apiKey = apiKey;
  });

  it('POSTs a Chat Completions request with the shared prompt and JSON mode', async () => {
    mockedPost.mockResolvedValue(chatResponse([suggestion('I48.0')]));

    const result = await suggester.suggest('Fibrillation auriculaire', [chunk('I48.0')]);

    expect(result).toEqual([suggestion('I48.0')]);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(body.model).toBe(config.llm.model);
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: expect.stringContaining('I48.0'),
    });
    expect(body.messages[0].content).toContain('Fibrillation auriculaire');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
  });

  it('omits the Authorization header when no API key is configured', async () => {
    mockedPost.mockResolvedValue(chatResponse([]));
    await suggester.suggest('x', [chunk('J18.1')]);
    expect(mockedPost.mock.calls[0][2].headers).toEqual({});
  });

  it('sends a bearer token when an API key is configured', async () => {
    openai.apiKey = 'sk-test-123';
    mockedPost.mockResolvedValue(chatResponse([]));
    await suggester.suggest('x', [chunk('J18.1')]);
    expect(mockedPost.mock.calls[0][2].headers).toEqual({
      Authorization: 'Bearer sk-test-123',
    });
  });

  it('throws GenerationError when the HTTP call fails', async () => {
    mockedPost.mockRejectedValue(new Error('401 Unauthorized'));
    await expect(suggester.suggest('x', [chunk('J18.1')])).rejects.toBeInstanceOf(
      GenerationError,
    );
  });
});
