export interface RagSuggestion {
  /** ICD-10 / CIM-10 code, e.g. "J18.1". */
  code_icd10: string;
  /** Human-readable label of the code. */
  description: string;
  /** Why this code matches, grounded in the retrieved CoCoA context. */
  justification: string;
  /** Bonus: extra coding rule / guidance found in CoCoA. */
  bonus_info: string;
  /**
   * True when the code appears in the chunks actually retrieved from CoCoA.
   * A `false` here means the LLM introduced a code that was not in the context.
   */
  grounded: boolean;
}

export class RagResponseDto {
  query: string;
  suggestions: RagSuggestion[];
}
