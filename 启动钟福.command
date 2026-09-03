#!/bin/zsh

set -u

PROJECT_DIR="/Users/aning/Documents/ChatGPT/New project/zhongfu-console"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
PORT=3000
URL="http://localhost:$PORT"
LOG_FILE="$PROJECT_DIR/.zhongfu-server.log"
PID_FILE="$PROJECT_DIR/.zhongfu-server.pid"

export PATH="$RUNTIME_DIR/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export COREPACK_HOME="$RUNTIME_DIR/corepack"

if /usr/bin/curl --silent --fail --max-time 2 "$URL" >/dev/null 2>&1; then
  /usr/bin/open "$URL"
  exit 0
fi

if [[ ! -x "$RUNTIME_DIR/node/bin/node" || ! -x "$RUNTIME_DIR/node/bin/pnpm" ]]; then
  /usr/bin/osascript -e 'display dialog "福七之家运行环境不完整，请联系维护人员。" buttons {"好"} default button "好" with icon stop'
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
nohup "$RUNTIME_DIR/node/bin/pnpm" next dev -p "$PORT" >"$LOG_FILE" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

for _ in {1..60}; do
  if /usr/bin/curl --silent --fail --max-time 2 "$URL" >/dev/null 2>&1; then
    /usr/bin/open "$URL"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

/usr/bin/osascript -e 'display dialog "福七之家启动失败，已打开运行日志。" buttons {"好"} default button "好" with icon stop'
/usr/bin/open "$LOG_FILE"
exit 1
