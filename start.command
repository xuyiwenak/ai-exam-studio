#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -q -r requirements.txt
.venv/bin/python server.py &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
  if curl -fsS "http://127.0.0.1:8765/api/config" >/dev/null 2>&1; then
    echo "模拟考试已启动：http://127.0.0.1:8765"
    open "http://127.0.0.1:8765"
    wait "$server_pid"
    exit
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "启动失败：8765 端口可能已被占用。"
    exit 1
  fi
  sleep 0.25
done
echo "本地服务启动超时。"
exit 1
