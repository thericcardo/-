#!/bin/bash
# Pre-scarica Playwright MCP nella cache npm, così il server parte subito.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

npm cache add @playwright/mcp@0.0.83 >/dev/null 2>&1 || true
npx -y @playwright/mcp@0.0.83 --version >/dev/null 2>&1 || true
