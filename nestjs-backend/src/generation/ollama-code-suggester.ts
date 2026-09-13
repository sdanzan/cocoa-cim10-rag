import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { config } from '../config';
import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { CodeSuggester, RawSuggestion } from './code-suggester';
import { buildSuggestionPrompt, parseSuggestions } from './prompt';

/** `CodeSuggester` backed by an Ollama `/api/generate` call forced to JSON. */
@Injectable()
export class OllamaCodeSuggester extends CodeSuggester {
  async suggest(
    query: string,
    passages: RetrievedChunk[],
  ): Promise<RawSuggestion[]> {
    const prompt = buildSuggestionPrompt(query, passages);

    let raw: string;
    try {
      const { data } = await axios.post(
        `${config.ollama.url}/api/generate`,
        {
          model: config.llm.model,
          prompt,
          format: 'json',
          stream: false,
          options: { temperature: 0 },
        },
        { timeout: config.llm.timeoutMs },
      );
      raw = data.response;
    } catch (err) {
      throw new GenerationError(
        `Ollama generation failed (model "${config.llm.model}"): ${(err as Error).message}`,
      );
    }

    return parseSuggestions(raw);
  }
}
