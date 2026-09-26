---
name: Persistent API test quotas
description: Explains rate-limit 429s in API test runs that use the shared workspace database.
---

When the workspace database is configured, API request quotas persist beyond process-local test resets. Multiple suites using the same local client address can accumulate quota and return 429 responses even when the feature under test is correct.

**Why:** Test helpers may clear in-memory counters without clearing the database-backed buckets used by the running API.

**How to apply:** If broad API suites fail with 429s, run focused test selections to isolate functional regressions and report the rate-limit interference separately.