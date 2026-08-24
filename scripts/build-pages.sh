#!/bin/bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_SOURCE="$PROJECT_ROOT/src/app/api"
API_HOLD="$PROJECT_ROOT/src/pages-build-api"
ROBOTS_SOURCE="$PROJECT_ROOT/src/app/robots.ts"
ROBOTS_HOLD="$PROJECT_ROOT/src/pages-build-robots.ts"

restore_routes() {
  if [ -d "$API_HOLD" ]; then mv "$API_HOLD" "$API_SOURCE"; fi
  if [ -f "$ROBOTS_HOLD" ]; then mv "$ROBOTS_HOLD" "$ROBOTS_SOURCE"; fi
}

trap restore_routes EXIT
mv "$API_SOURCE" "$API_HOLD"
mv "$ROBOTS_SOURCE" "$ROBOTS_HOLD"

cd "$PROJECT_ROOT"
ZHONGFU_STATIC_EXPORT=1 \
NEXT_PUBLIC_STATIC_MODE=1 \
NEXT_PUBLIC_BASE_PATH=/zhongfu-console \
NEXT_PUBLIC_CHAT_API_URL=https://zhongfu-assistant-pages.pages.dev/api/chat \
pnpm next build --webpack

touch "$PROJECT_ROOT/out/.nojekyll"
