---
name: Recipe guidance contract
description: Durable product decision for complete beginner cooking instructions.
---

Curated and server-discovered recipes use the same structured cooking guidance contract: ordered steps carry exact ingredient amounts, sensory cues, common mistakes, and structured Fahrenheit/Celsius temperatures; food-safety targets are separate from general temperatures. A method alternative is included only when it has its own complete ordered steps.

**Why:** Beginner cooking mode needs data it can render and scale safely rather than parsing prose. Keeping the contract shared prevents discovered recipes from silently losing the guidance that curated recipes provide.

**How to apply:** When adding or changing recipe generation, preserve the structured fields, reject stale cached recipes that lack them, scale ingredient amounts without scaling durations, and keep safety temperatures explicit.