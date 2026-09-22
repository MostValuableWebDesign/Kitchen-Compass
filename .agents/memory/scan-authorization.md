---
name: Scan authorization
description: Durable rules for protecting paid photo analysis from client-controlled identity changes.
---

The scan endpoint must authorize with a server-issued, signed bearer credential and enforce quotas using both the credential identity and requester identity. Client installation headers are metadata only, never authorization or quota identity.

**Why:** A secret or self-declared installation header in a mobile bundle can be copied or changed, so it cannot protect paid provider usage.

**How to apply:** Keep quota state in the shared database in production and fail closed if persistent quota storage is unavailable; an in-memory fallback is acceptable only for non-production local/test operation.

Proxy-derived requester IPs must be enabled only through an explicit `TRUSTED_PROXY_IPS` deployment allowlist. Without that allowlist, use the socket address so arbitrary `X-Forwarded-For` values cannot change quota identity.

**Why:** Globally trusting proxy headers lets a caller rotate a spoofed forwarded address to bypass scan and token-issuance quotas.

**How to apply:** Configure exact proxy addresses for deployments that need per-client IP quotas; leave the allowlist empty in direct/local environments.