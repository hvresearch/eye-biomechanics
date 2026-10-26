#!/usr/bin/env bash
# SessionStart hook: prepare dependencies in Claude Code cloud sessions.
# Idempotent (runs on every start/resume); no-op outside cloud sessions.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "$(git rev-parse --show-toplevel)"

command -v pnpm >/dev/null 2>&1 || corepack enable || npm install -g pnpm

(cd web && pnpm install --frozen-lockfile)
(cd science && uv sync --all-groups)
(cd web && pnpm --filter @eye/viewer exec playwright install --with-deps chromium) || echo "playwright browsers unavailable; CI runs e2e"
