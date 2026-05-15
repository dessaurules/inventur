#!/usr/bin/env bash
set -euo pipefail

# Repo-Root relativ zu diesem Skript
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# launchd/minimale Umgebungen: übliche Pfade für Homebrew/system Node
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$HOME/.local/bin:${PATH}"

# nvm (optional)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
elif [[ -s "$HOME/.config/nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.config/nvm/nvm.sh"
fi

mkdir -p "$ROOT/logs"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm nicht im PATH gefunden ($PATH)." >>"$ROOT/logs/autostart.stderr.log"
  exit 127
fi

exec npm run dev:full >>"$ROOT/logs/autostart.stdout.log" 2>>"$ROOT/logs/autostart.stderr.log"
