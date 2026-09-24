---
name: Ingredient add quantity defaults
description: Product rules for default quantities and duplicate kitchen stock additions.
---

New ingredient additions default to `1 ea` when no quantity is entered. Preserve explicit quantities. When a user confirms an additional copy of a matching item at the same location, update the existing row rather than creating a duplicate; default increments use the existing item's known unit, or `ea` when its quantity is unknown. Photo review keeps “Same item” (no stock change) distinct from “Additional stock” (increment).

**Why:** A manual or barcode add represents one new item, while a photo may show stock already counted. Explicit review avoids overcounting; a matching row should retain its stored unit.

**How to apply:** Use the shared kitchen quantity and merge helpers for scan and manual entry. Keep recipe quantities and non-addition corrections separate, and never treat package size as inventory quantity.