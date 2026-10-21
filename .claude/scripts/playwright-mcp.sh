#!/bin/bash
# Avvia Playwright MCP con versione fissata.
# Nel cloud usa il Chromium preinstallato invece di scaricarne uno.
set -euo pipefail

args=(--headless --isolated --output-dir "$(dirname "$0")/../../.playwright-mcp")
if [ -x /opt/pw-browsers/chromium ]; then
  args+=(--browser chromium --executable-path /opt/pw-browsers/chromium)
fi

exec npx -y @playwright/mcp@0.0.83 "${args[@]}" "$@"
