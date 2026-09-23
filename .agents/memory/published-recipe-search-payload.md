---
name: Published recipe search payload
description: Why online recipe anchors and pantry matching ingredients must stay separate.
---

Keep provider search anchors separate from the complete confirmed-pantry payload. Apply anchor ranking and seasoning exclusion only to the provider search list; use the pantry payload to calculate matched and missing recipe ingredients.

**Why:** One list cannot serve both purposes accurately. Removing common seasonings from the only payload makes recipes incorrectly report salt, oil, and similar items as missing even when the user has them.

**How to apply:** When changing published-recipe search, preserve the independent anchor limit and full-pantry limit, and test both provider query selection and matched/missing calculations.