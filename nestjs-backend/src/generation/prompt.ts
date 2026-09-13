import { Logger } from '@nestjs/common';

import { GenerationError } from '../errors';
import type { RetrievedChunk } from '../retrieval/passage-retriever';
import { RawSuggestion } from './code-suggester';

const logger = new Logger('SuggestionPrompt');

/**
 * Build the prompt sent to the suggestion LLM: only the retrieved CoCoA passages
 * as context, plus a JSON output contract. Shared by every `CodeSuggester`
 * adapter so their outputs stay comparable.
 *
 * Kept in French: the source document, the models and the clinical domain are
 * all French-language.
 */
export function buildSuggestionPrompt(
  query: string,
  passages: RetrievedChunk[],
): string {
  const context = passages
    .map((c, i) => `[${i + 1}] Code CIM-10 : ${c.code} - ${c.title}\n${c.text}`)
    .join('\n---\n');

  return `Tu es un assistant medical expert en codage CIM-10 (PMSI).
En te basant STRICTEMENT ET UNIQUEMENT sur les extraits du document d'expertise CoCoA ci-dessous, propose le ou les codes CIM-10 appropries pour l'element clinique du patient.
Ne devine rien. N'invente aucun code. Si l'information n'est pas dans le contexte, renvoie une liste "suggestions" vide.
Propose au maximum 3 suggestions, de la plus pertinente a la moins pertinente.

CONTEXTE CoCoA :
${context}

ELEMENT CLINIQUE DU PATIENT : ${query}

Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{
  "query": "${query.replace(/"/g, "'")}",
  "suggestions": [
    {
      "code_icd10": "code CIM-10 exact tire du contexte",
      "description": "libelle du code",
      "justification": "pourquoi ce code correspond, en citant le contexte",
      "bonus_info": "regle de codage / precision supplementaire trouvee dans le contexte, sinon \\"\\""
    }
  ]
}`;
}

/**
 * Parse the model's JSON reply into raw suggestions. Drops entries without a
 * code and coerces every field to a string. Grounding is checked later by
 * `RAGService`. Throws `GenerationError` on unparseable output.
 */
export function parseSuggestions(raw: string): RawSuggestion[] {
  let parsed: { suggestions?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(`Model did not return valid JSON: ${raw?.slice(0, 300)}`);
    throw new GenerationError(
      'The language model did not return valid JSON. Please retry.',
    );
  }

  return (parsed.suggestions ?? [])
    .filter((s: any) => s?.code_icd10)
    .map((s: any) => ({
      code_icd10: String(s.code_icd10),
      description: String(s.description ?? ''),
      justification: String(s.justification ?? ''),
      bonus_info: String(s.bonus_info ?? ''),
    }));
}
