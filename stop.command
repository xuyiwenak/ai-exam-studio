#!/bin/zsh
set -e
agent="$HOME/Library/LaunchAgents/com.xuyiwenak.examopc.plist"
if [[ -f "$agent" ]]; then
  launchctl bootout "gui/$(id -u)" "$agent" >/dev/null 2>&1 || true
  rm "$agent"
fi
echo "模拟考试本地服务已停止。"
