import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

import { config } from '../config';
import { GenerationError, RetrieverUnavailableError } from '../errors';
import { CodeSuggester, RawSuggestion } from '../generation/code-suggester';
import {
  PassageRetriever,
  RetrievedChunk,
} from '../retrieval/passage-retriever';
import { RAGService } from './rag.service';

class FakeRetriever extends PassageRetriever {
  passages: RetrievedChunk[] = [];
  error?: Error;
  countValue = 8919;
  countError?: Error;
  retrieveCalls = 0;

  async retrieve(): Promise<RetrievedChunk[]> {
    this.retrieveCalls++;
    if (this.error) throw this.error;
    return this.passages;
  }

  async count(): Promise<number> {
    if (this.countError) throw this.countError;
    return this.countValue;
  }
}

class FakeSuggester extends CodeSuggester {
  suggestions: RawSuggestion[] = [];
  error?: Error;
  calls = 0;
  lastPassages?: RetrievedChunk[];

  async suggest(_query: string, passages: RetrievedChunk[]): Promise<RawSuggestion[]> {
    this.calls++;
    this.lastPassages = passages;
    if (this.error) throw this.error;
    return this.suggestions;
  }
}

const chunk = (code: string, distance = 0.1): RetrievedChunk => ({
  code,
  title: `title ${code}`,
  text: `${code} text`,
  distance,
});

const raw = (code: string): RawSuggestion => ({
  code_icd10: code,
  description: `desc ${code}`,
  justification: 'because the context says so',
  bonus_info: '',
});

describe('RAGService', () => {
  let retriever: FakeRetriever;
  let suggester: FakeSuggester;
  let service: RAGService;

  beforeEach(() => {
    retriever = new FakeRetriever();
    suggester = new FakeSuggester();
    service = new RAGService(retriever, suggester);
  });

  describe('suggestCodes', () => {
    it('flags a suggestion as grounded when its code was retrieved', async () => {
      retriever.passages = [chunk('I48.0'), chunk('I48.1')];
      suggester.suggestions = [raw('I48.0')];

      const result = await service.suggestCodes('Fibrillation auriculaire');

      expect(result.query).toBe('Fibrillation auriculaire');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].grounded).toBe(true);
    });

    it('flags a suggestion as not grounded when the code was not retrieved', async () => {
      retriever.passages = [chunk('N17.8')];
      suggester.suggestions = [raw('R39.2')];

      const result = await service.suggestCodes('Insuffisance rénale fonctionnelle');

      expect(result.suggestions[0].code_icd10).toBe('R39.2');
      expect(result.suggestions[0].grounded).toBe(false);
    });

    it('returns an empty list without calling the suggester when nothing is retrieved', async () => {
      retriever.passages = [];

      const result = await service.suggestCodes('Toux purulente');

      expect(result).toEqual({ query: 'Toux purulente', suggestions: [] });
      expect(suggester.calls).toBe(0);
    });

    it('passes an empty suggestion list through', async () => {
      retriever.passages = [chunk('J18.1')];
      suggester.suggestions = [];

      const result = await service.suggestCodes('Fièvre');

      expect(result).toEqual({ query: 'Fièvre', suggestions: [] });
      expect(suggester.calls).toBe(1);
    });

    it('maps a retriever failure to 503', async () => {
      retriever.error = new RetrieverUnavailableError('chroma down');

      await expect(service.suggestCodes('x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('maps a generation failure to 503', async () => {
      retriever.passages = [chunk('J18.1')];
      suggester.error = new GenerationError('bad json');

      await expect(service.suggestCodes('x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('lets an unexpected error propagate unchanged', async () => {
      retriever.error = new TypeError('boom');

      await expect(service.suggestCodes('x')).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe('maxDistance filtering (B9)', () => {
    let original: number | undefined;

    beforeEach(() => {
      original = config.retrieval.maxDistance;
    });
    afterEach(() => {
      (config.retrieval as { maxDistance?: number }).maxDistance = original;
    });

    it('keeps only passages within maxDistance before generating', async () => {
      (config.retrieval as { maxDistance?: number }).maxDistance = 0.5;
      retriever.passages = [chunk('I48.0', 0.2), chunk('J18.1', 0.9)];
      suggester.suggestions = [raw('I48.0')];

      await service.suggestCodes('x');

      expect(suggester.lastPassages?.map((p) => p.code)).toEqual(['I48.0']);
    });

    it('returns empty without calling the suggester when every passage is too far', async () => {
      (config.retrieval as { maxDistance?: number }).maxDistance = 0.3;
      retriever.passages = [chunk('I48.0', 0.8), chunk('J18.1', 0.9)];

      const result = await service.suggestCodes('x');

      expect(result).toEqual({ query: 'x', suggestions: [] });
      expect(suggester.calls).toBe(0);
    });
  });

  describe('health', () => {
    it('reports the chunk count when the retriever is reachable', async () => {
      retriever.countValue = 8919;

      await expect(service.health()).resolves.toEqual({
        chroma: true,
        chunks: 8919,
        collection: 'cocoa_cim10_v2',
      });
    });

    it('reports chroma:false when the retriever throws', async () => {
      retriever.countError = new Error('down');

      await expect(service.health()).resolves.toEqual({
        chroma: false,
        collection: 'cocoa_cim10_v2',
      });
    });
  });
});
