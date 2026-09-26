---
name: PNPM lockfile repairs
description: Keep post-merge installs frozen while repairing manifest-lockfile drift without overlooking peer-context churn.
---

Keep the post-merge install frozen. Reconcile the dependency manifest and lockfile rather than switching the setup script to a mutable install just to hide drift.

**Why:** A lockfile-only sync with the workspace's current pnpm re-resolved many optional peer contexts while repairing one stale Expo specifier, creating a broad lockfile diff.

**How to apply:** Review lockfile-only output for unrelated peer-context churn, confirm resolved package releases are still intended, and verify with `pnpm install --frozen-lockfile`.