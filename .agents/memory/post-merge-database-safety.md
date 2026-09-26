---
name: Post-merge database safety
description: Protect persistent runtime-created tables from Drizzle post-merge drops and non-interactive confirmation failures.
---

Keep persistent tables created or queried with raw SQL represented in the Drizzle schema as well. A non-interactive schema push must fail closed when it reports a confirmation or data-loss prompt; never bypass the prompt with a forced push.

**Why:** Drizzle treats tables missing from its schema as candidates for deletion. A post-merge push once proposed deleting the rate-limit quota table and its existing rows, while the non-TTY CLI emitted its prompt error without making the result obvious.

**How to apply:** When adding `CREATE TABLE IF NOT EXISTS` to runtime code, add a matching `pgTable` export. Keep the post-merge push non-forced and make the script detect interactive/data-loss prompt output.