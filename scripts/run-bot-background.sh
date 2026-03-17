#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p logs
nohup "$ROOT_DIR/scripts/run-bot.sh" "$@" > logs/bot.log 2>&1 &
echo $! > logs/bot.pid
echo "started pid $(cat logs/bot.pid)"
