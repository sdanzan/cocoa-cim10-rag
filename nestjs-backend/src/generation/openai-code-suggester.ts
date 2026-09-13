import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { config } from '../config';
import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { CodeSuggester, RawSuggestion } from './code-suggester';
import { buildSuggestionPrompt, parseSuggestions } from './prompt';

/**
 * `CodeSuggester` speaking the OpenAI Chat Completions wire format
 * (`POST {baseUrl}/chat/completions`). `OPENAI_BASE_URL` selects the actual
 * backend: OpenAI, OpenRouter, Groq, Together, Anthropic's `/v1/` compatible
 * endpoint, or a local Ollama / vLLM `/v1`. Same prompt and parser as every
 * other adapter.
 */
@Injectable()
export class OpenAiCodeSuggester extends CodeSuggester {
  async suggest(
    query: string,
    passages: RetrievedChunk[],
  ): Promise<RawSuggestion[]> {
    const prompt = buildSuggestionPrompt(query, passages);
    const { baseUrl, apiKey } = config.llm.openai;

    let raw: string;
    try {
      const { data } = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: config.llm.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' },
          stream: false,
        },
        {
          timeout: config.llm.timeoutMs,
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        },
      );
      raw = data.choices?.[0]?.message?.content;
    } catch (err) {
      throw new GenerationError(
        `OpenAI-compatible generation failed (model "${config.llm.model}", ${baseUrl}): ${(err as Error).message}`,
      );
    }

    return parseSuggestions(raw);
  }
}
