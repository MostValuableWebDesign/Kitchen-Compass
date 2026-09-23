---
name: Recipe calculation provenance
description: Durable rule for recipe score and nutrition provenance
---

Recipe health scores and nutrition values must come from the shared calculation and reference-data path, not scalar values supplied by a recipe-generation model. Unsupported ingredient names, units, or quantities must produce an explicit insufficient-information result rather than a precise-looking estimate or an unverified source attribution.

**Why:** Generated recipes can be structurally valid while their nutrition claims are not traceable. Separating calculation from generation keeps the general-health rubric reproducible and prevents allergy safety from being folded into the score.

**How to apply:** When extending recipe discovery or curated recipes, add traceable reference coverage or preserve the insufficient-information state; keep per-serving values and any separately labeled totals derived from ingredient quantities.

Recipe discovery must also keep an explicit, conservative known-safe ingredient allowlist for common pantry staples; generated recipes containing unsupported allergen information should be rejected rather than silently treated as safe.

**Why:** Valid AI recipe structure is not enough for allergy safety. Common staples such as cooking oils and pepper need explicit reference coverage or otherwise cause every generated candidate to be discarded.

**How to apply:** Expand the allowlist only for ingredients with a defensible allergen profile, keep allergen aliases ahead of the safe check, and preserve rejection for unknown ingredients.

Recipe discovery should validate candidates individually and make one constrained correction attempt when the entire first batch is malformed or unsafe; one bad generated candidate must not turn into an offline fallback when a valid retry is possible.

**Why:** The provider can return structurally invalid steps or unknown pantry ingredients even under a strict schema request, especially when the inventory prompt is large.

**How to apply:** Discard invalid candidates by index, retry within the request deadline using confirmed inventory and explicit basic ingredients, and keep deterministic allergen and preference checks on the retry output.

The constrained retry must rebuild its prompt from only inventory names the deterministic allergen checker can assess. It must not append corrections to the original full inventory prompt, because scanned sauces, blends, and packaged foods can otherwise be selected again and make every retry candidate fail.

**Why:** Confirmed inventory means the item is present; it does not mean its allergen profile is known. Reusing the full inventory caused valid recipe generation to end in an offline fallback whenever all candidates included an unsupported scanned item.

**How to apply:** Filter retry inventory through the same ingredient allergen assessment used for final validation, preserve the original preferences, and explicitly restrict missing basics to known-safe names.