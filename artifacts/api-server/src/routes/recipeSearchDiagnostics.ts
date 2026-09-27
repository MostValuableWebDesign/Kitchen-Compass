export const RECIPE_QUALIFICATION_STAGES = [
  "candidateLimit",
  "invalid",
  "allergy",
  "duplicate",
  "noPantryMatch",
  "tooManyMissing",
  "excluded",
  "notKidFriendly",
  "courseMismatch",
  "disliked",
  "resultLimit",
] as const;

export type RecipeQualificationStage = (typeof RECIPE_QUALIFICATION_STAGES)[number];

export type RecipeSearchDiagnostics = {
  candidatesReceived: number;
  candidatesRemoved: Record<RecipeQualificationStage, number>;
  eligible: number;
};

export function createRecipeSearchDiagnostics(): RecipeSearchDiagnostics {
  return {
    candidatesReceived: 0,
    candidatesRemoved: {
      candidateLimit: 0,
      invalid: 0,
      allergy: 0,
      duplicate: 0,
      noPantryMatch: 0,
      tooManyMissing: 0,
      excluded: 0,
      notKidFriendly: 0,
      courseMismatch: 0,
      disliked: 0,
      resultLimit: 0,
    },
    eligible: 0,
  };
}

export function recordCandidateRemoval(
  diagnostics: RecipeSearchDiagnostics | undefined,
  stage: RecipeQualificationStage,
  count = 1,
) {
  if (diagnostics) diagnostics.candidatesRemoved[stage] += count;
}

export type RecipeNormalizationFailure = "invalid" | "allergy";