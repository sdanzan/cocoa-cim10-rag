import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';

import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { buildSuggestionPrompt, parseSuggestions } from './prompt';

const chunk = (code: string): RetrievedChunk => ({
  code,
  title: `title ${code}`,
  text: `${code} commentary`,
  distance: 0.1,
});

describe('buildSuggestionPrompt', () => {
  it('embeds the query and every retrieved passage', () => {
    const prompt = buildSuggestionPrompt('Fibrillation auriculaire', [
      chunk('I48.0'),
      chunk('I48.1'),
    ]);

    expect(prompt).toContain('ELEMENT CLINIQUE DU PATIENT : Fibrillation auriculaire');
    expect(prompt).toContain('[1] Code CIM-10 : I48.0 - title I48.0');
    expect(prompt).toContain('[2] Code CIM-10 : I48.1 - title I48.1');
    expect(prompt).toContain('I48.0 commentary');
  });

  it('escapes double quotes in the echoed query', () => {
    const prompt = buildSuggestionPrompt('a "quoted" term', []);
    expect(prompt).toContain(`"query": "a 'quoted' term"`);
  });
});

describe('parseSuggestions', () => {
  it('drops entries without a code and coerces every field to a string', () => {
    const raw = JSON.stringify({
      suggestions: [
        { description: 'no code' },
        { code_icd10: 'J18.1', description: 'Pneumonie' },
      ],
    });

    expect(parseSuggestions(raw)).toEqual([
      {
        code_icd10: 'J18.1',
        description: 'Pneumonie',
        justification: '',
        bonus_info: '',
      },
    ]);
  });

  it('returns [] for an empty suggestion list', () => {
    expect(parseSuggestions(JSON.stringify({ suggestions: [] }))).toEqual([]);
  });

  it('throws GenerationError on unparseable output', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(() => parseSuggestions('sorry, no JSON here')).toThrow(GenerationError);
  });
});
