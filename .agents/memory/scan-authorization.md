---
name: Scan authorization
description: Durable rules for protecting paid photo analysis from client-controlled identity changes.
---

The scan endpoint must authorize with a server-issued, signed bearer credential and enforce quotas using both the credential identity and requester identity. Client installation headers are metadata only, never authorization or quota identity.

**Why:** A secret or self-declared installation header in a mobile bundle can be copied or changed, so it cannot protect paid provider usage.

**How to apply:** Keep quota state in the shared database in production and fail closed if persistent quota storage is unavailable; an in-memory fallback is acceptable only for non-production local/test operation.