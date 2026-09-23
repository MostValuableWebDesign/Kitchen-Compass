---
name: Published recipe search payload
description: Why online recipe anchors and pantry matching ingredients must stay separate.
---

Keep provider search anchors separate from the complete confirmed-pantry payload. Automatic mode may use up to 30 ranked anchors; manual mode uses only the explicitly selected anchors. Apply seasoning exclusion only to anchor eligibility, and use up to 30 pantry ingredients for matched/missing calculations.

**Why:** One list cannot serve both purposes accurately. Removing common seasonings from the only payload makes recipes incorrectly report salt, oil, and similar items as missing even when the user has them.

**How to apply:** Preserve the independent anchor and pantry lists, make manual selection opt-in, and exclude recipe IDs already shown in the session so consecutive searches produce fresh results. Test provider queries, exclusions, and matched/missing calculations independently.