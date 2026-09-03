#!/bin/zsh

PORT=3000
PIDS=$(/usr/sbin/lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)

if [[ -z "$PIDS" ]]; then
  /usr/bin/osascript -e 'display notification "网站当前没有运行" with title "福七之家"'
  exit 0
fi

for PID in ${(f)PIDS}; do
  kill "$PID" 2>/dev/null || true
done

/usr/bin/osascript -e 'display notification "网站服务已停止" with title "福七之家"'
