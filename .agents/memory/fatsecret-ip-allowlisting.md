---
name: FatSecret IP allowlisting
description: Explains FatSecret API error 21 when requests originate from Replit.
---

FatSecret documents API error 21 as an invalid IP address. Its OAuth2 guidance supports restricting requests to configured IP addresses. Replit deployments use dynamically assigned outbound IPs; a fixed static egress address is not documented as available.

**Why:** Live FatSecret searches returned error 21 while the mocked integration test passed, showing a provider-side network restriction rather than a recipe parsing failure.

**How to apply:** When FatSecret appears in `providersUnavailable`, inspect the sanitized provider log. An allowlist entry for an observed Replit IP may be temporary; use a stable egress route or provider-supported IP ranges for reliability.