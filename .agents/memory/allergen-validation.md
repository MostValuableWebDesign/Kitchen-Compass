---
name: Allergen validation
description: Durable rules for validating recipe allergens across generated recipes, saved recipes, and substitutions.
---

AI-declared allergen lists and completeness flags are advisory, never proof of safety. Ingredient-derived allergen matching must remain the source of truth for both server filtering and client readiness.

**Why:** A model can omit or mislabel an allergen even when it claims its metadata is complete. Saved recipes also need to be re-evaluated when a user changes allergies.

**How to apply:** Keep the deterministic ingredient vocabulary and conservative unknown-ingredient policy shared between API and client code. Validate substitutions with the same rule, keep dietary restrictions separate from health scoring, and reject or mark recipes unsafe when an ingredient cannot be assessed.