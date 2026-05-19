#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$HOME/.local/bin:${PATH}"

for port in 3000 5173 8090; do
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Beende Prozesse auf Port $port …"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

sleep 1
exec npm run dev:full
