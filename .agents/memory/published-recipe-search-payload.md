---
name: Published recipe search payload
description: Why online recipe anchors and pantry matching ingredients must stay separate.
---

Keep provider search anchors separate from the confirmed-pantry payload. Automatic mode may use up to 30 ranked anchors; manual mode uses only the explicitly selected anchors. Apply seasoning exclusion only to anchor eligibility, and send up to 64 confirmed pantry ingredients for matched/missing calculations.

**Why:** Search providers need a bounded set of useful query anchors, while recipe qualification must consider the wider pantry. Truncating matching ingredients falsely counted available food as missing; raising the missing allowance also keeps common-provider searches from being overly restrictive.

**How to apply:** Preserve the independent anchor and pantry lists, keep anchors at 30 and confirmed pantry matching at 64, allow up to seven counted missing food ingredients, report eligible counts per provider, and cap combined output at 30. Keep manual selection opt-in and exclude recipe IDs already shown in the session.

Published online results may contain up to seven counted missing food ingredients. Herbs and spices are omitted from that count and from the displayed missing list; each provider reports its eligible count, while the combined response is capped at 30 recipes.