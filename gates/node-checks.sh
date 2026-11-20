#!/usr/bin/env bash
# Gate: type check and tests, run offline (no install, no network).
# Fails (exit 1) when node_modules, tsc or jest cannot be found.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# A fresh clone has no node_modules: link it from the clone origin's folder.
if [ ! -e node_modules ]; then
  origin=$(git remote get-url origin 2>/dev/null || true)
  case "$origin" in
    /*) if [ -d "$origin/node_modules" ]; then ln -s "$origin/node_modules" node_modules; fi ;;
  esac
fi
if [ ! -d node_modules ] || [ ! -f node_modules/typescript/bin/tsc ] || [ ! -f node_modules/jest/bin/jest.js ]; then
  echo "node-checks: FAIL: node_modules (with typescript and jest) is missing; this gate does not install" >&2
  exit 1
fi

node node_modules/typescript/bin/tsc --noEmit || { echo "node-checks: FAIL: type check" >&2; exit 1; }
node node_modules/jest/bin/jest.js || { echo "node-checks: FAIL: tests" >&2; exit 1; }
echo "node-checks: ok"
