#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile

schema_log="$(mktemp)"
trap 'rm -f "$schema_log"' EXIT

if pnpm --filter @workspace/db run push 2>&1 | tee "$schema_log"; then
  if grep -Eq 'Interactive prompts require a TTY|Found data-loss statements:|Do you still want to push changes' "$schema_log"; then
    echo "Database schema push needs interactive review; refusing to report setup success." >&2
    exit 1
  fi
else
  exit 1
fi
