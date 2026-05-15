#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STARTER="$ROOT/scripts/start-dev-stack.sh"
PLIST_DST="$HOME/Library/LaunchAgents/de.vibe-inventur.devstack.plist"
LABEL="de.vibe-inventur.devstack"

chmod +x "$STARTER"

cat >"$PLIST_DST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$STARTER</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/logs/autostart.wrapper.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/logs/autostart.wrapper.stderr.log</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load "$PLIST_DST"

echo "LaunchAgent installiert: $PLIST_DST"
echo "Nach jedem Login startet PocketBase + Vite + Express (npm run dev:full)."
echo "Logs: $ROOT/logs/autostart.*.log"
echo ""
echo "Deaktivieren: bash scripts/uninstall-macos-login-autostart.sh"
