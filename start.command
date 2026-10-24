#!/bin/zsh
set -e
cd "${0:A:h}"

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -q -r requirements.txt

EXAM_ROOT="$PWD" .venv/bin/python - <<'PY'
import os
import plistlib
from pathlib import Path

root = Path(os.environ["EXAM_ROOT"])
local = root / ".local"
local.mkdir(exist_ok=True)
local.chmod(0o700)
agent = Path.home() / "Library" / "LaunchAgents" / "com.xuyiwenak.examopc.plist"
agent.parent.mkdir(parents=True, exist_ok=True)
agent.write_bytes(plistlib.dumps({
    "Label": "com.xuyiwenak.examopc",
    "ProgramArguments": [str(root / ".venv" / "bin" / "python"), str(root / "server.py")],
    "WorkingDirectory": str(root),
    "RunAtLoad": True,
    "KeepAlive": True,
    "StandardOutPath": str(local / "server.log"),
    "StandardErrorPath": str(local / "server.log"),
}))
PY

agent="$HOME/Library/LaunchAgents/com.xuyiwenak.examopc.plist"
if ! curl -fsS "http://127.0.0.1:8765/api/config" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "$agent" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$agent"
fi

for attempt in {1..40}; do
  if curl -fsS "http://127.0.0.1:8765/api/config" >/dev/null 2>&1; then
    echo "模拟考试已启动：http://127.0.0.1:8765"
    echo "服务会在后台运行；如需停止，双击 stop.command。"
    if [[ "${EXAMOPC_NO_OPEN:-0}" != "1" ]]; then
      open "http://127.0.0.1:8765"
    fi
    exit 0
  fi
  sleep 0.25
done

echo "本地服务启动失败，请查看 .local/server.log。"
exit 1
