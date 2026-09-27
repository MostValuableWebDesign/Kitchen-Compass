---
name: Published recipe search payload
description: Why online recipe anchors and pantry matching ingredients must stay separate.
---

Keep provider search anchors separate from the confirmed-pantry payload. Automatic mode may use up to 30 ranked anchors; manual mode uses only the explicitly selected anchors. Apply seasoning exclusion only to anchor eligibility, and send up to 64 confirmed pantry ingredients for matched/missing calculations.

**Why:** Search providers need a bounded set of useful query anchors, while recipe qualification must consider the wider pantry. Truncating the matching list at 30 can falsely count available ingredients as missing and reject otherwise eligible recipes.

**How to apply:** Preserve the independent anchor and pantry lists, make manual selection opt-in, and exclude recipe IDs already shown in the session so consecutive searches produce fresh results. Test provider queries, exclusions, and matched/missing calculations independently.

Published online results must contain no more than five missing food ingredients. Herbs and spices are omitted from that count and from the displayed missing list; eligible results are ordered by most matched pantry ingredients, then fewest missing.