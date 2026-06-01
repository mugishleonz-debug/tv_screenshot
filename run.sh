#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN}"
export TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:?Set TELEGRAM_CHAT_ID}"
export SCREENSHOT_DIR="/Volumes/ドライブ D/tv_screenshot_images"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

/opt/homebrew/bin/node capture.js >> logs/run.log 2>&1
