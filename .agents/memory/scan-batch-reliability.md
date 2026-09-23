---
name: Multi-photo scan reliability
description: Vision scan batches need bounded output and enough provider time for real multi-image requests.
---

Multi-photo ingredient recognition should bound the model's response size while allowing more processing time than a single-photo request.

**Why:** Tiny-image tests can pass quickly even when real batches fail during structured-output validation or near the request timeout.

**How to apply:** Keep the photo count, payload size, response-token budget, prompt output cap, and abort timeout aligned; log only safe failure classifications when diagnosing provider responses.