---
name: Ingredient icon matching
description: Matching specific food illustrations without losing form or misclassifying prepared products
---

Match visually meaningful food forms before collapsing ingredient names to canonical identities. A prepared product such as a sauce or stock should take priority over a base ingredient named within it. Handle singular and plural forms and remove accents for display matching.

**Why:** Inventory identity normalization is designed for comparison, not visual specificity. It can collapse a cut of meat to its parent food; broad keyword rules also mistake a sauce for pasta or a seasoning for a fresh pepper.

**How to apply:** When adding more food icons, audit common ingredient names and compound labels against both the icon mapping and its renderer. Keep matching for display separate from inventory identity, and cover forms and compound names in tests.