---
name: Recipe calculation provenance
description: Durable rule for recipe score and nutrition provenance
---

Recipe health scores and nutrition values must come from the shared calculation and reference-data path, not scalar values supplied by a recipe-generation model. Unsupported ingredient names, units, or quantities must produce an explicit insufficient-information result rather than a precise-looking estimate or an unverified source attribution.

**Why:** Generated recipes can be structurally valid while their nutrition claims are not traceable. Separating calculation from generation keeps the general-health rubric reproducible and prevents allergy safety from being folded into the score.

**How to apply:** When extending recipe discovery or curated recipes, add traceable reference coverage or preserve the insufficient-information state; keep per-serving values and any separately labeled totals derived from ingredient quantities.