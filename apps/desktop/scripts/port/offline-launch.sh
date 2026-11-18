#!/usr/bin/env bash
# Launch a packaged VidBee build offline on a throwaway profile and log every
# hostname it tries to resolve.
# Usage: offline-launch.sh <linux-unpacked dir> <run dir> [seconds]
# Never touches ~/.config/vidbee or ~/.config/VidBee: HOME, XDG dirs, the user-data
# dir and both automation descriptors all point inside <run dir>. The network
# namespace has loopback only; DNS goes to a logger that answers 127.0.0.1.
set -euo pipefail
APP="$1"; RUN="$2"; SECS="${3:-75}"
HERE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$RUN"; mkdir -p "$RUN/home/.config" "$RUN/home/.cache" "$RUN/home/.local/share" "$RUN/userdata"
BIN="$APP/vidbee"
test -x "$BIN"
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > "$RUN/resolv.conf"
sed -E 's/^hosts:.*/hosts: files dns/' /etc/nsswitch.conf > "$RUN/nsswitch.conf"
RESOLV="$(readlink -f /etc/resolv.conf)"
env -i \
  PATH="/usr/bin:/bin" \
  HOME="$RUN/home" \
  XDG_CONFIG_HOME="$RUN/home/.config" \
  XDG_CACHE_HOME="$RUN/home/.cache" \
  XDG_DATA_HOME="$RUN/home/.local/share" \
  XDG_RUNTIME_DIR="$RUN/home/.cache" \
  LANG="${LANG:-en_US.UTF-8}" \
  VIDBEE_ALLOW_MULTIPLE_INSTANCES=1 \
  VIDBEE_AUTOMATION_DESCRIPTOR="$RUN/automation.json" \
  VIDBEE_MCP_CONFIG="$RUN/mcp.json" \
  unshare -rmn sh -c '
    ip link set lo up
    mount --bind "$1/resolv.conf" "$2"
    mount --bind "$1/nsswitch.conf" /etc/nsswitch.conf
    python3 -I "$3/dns-logger.py" "$1/dns.log" &
    sleep 1
    getent hosts selftest.dns-logger.invalid > /dev/null || true
    exec "$0" --no-sandbox --ozone-platform=headless --disable-gpu \
      --user-data-dir="$1/userdata" --remote-debugging-port=9230 > "$1/stdout.log" 2>&1
  ' "$BIN" "$RUN" "$RESOLV" "$HERE" &
LAUNCHER=$!
sleep "$SECS"
# Stop only this test instance and its DNS logger.
pkill -TERM -f -- "--user-data-dir=$RUN/userdata" || true
pkill -TERM -f -- "dns-logger.py $RUN/dns.log" || true
sleep 3
pkill -KILL -f -- "--user-data-dir=$RUN/userdata" || true
wait "$LAUNCHER" 2>/dev/null || true
echo "done; logs under $RUN"
