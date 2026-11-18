#!/usr/bin/env bash
# Usage: offline-launch.sh <linux-unpacked> <new run dir> [seconds] [seed dir]
# The caller must use a new directory. All descendants belong to a dedicated
# session, so cleanup never matches or signals another VidBee instance.
set -euo pipefail
APP="$(realpath "$1")"
RUN="$(realpath -m "$2")"
SECS="${3:-75}"
SEED="${4:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
test ! -e "$RUN" || { echo "run directory already exists: $RUN" >&2; exit 1; }
test -x "$APP/vidbee"
mkdir -p "$RUN/home/.config" "$RUN/home/.cache" "$RUN/home/.local/share" "$RUN/userdata"
if [ -n "$SEED" ]; then cp -a "$SEED/." "$RUN/userdata/"; fi
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > "$RUN/resolv.conf"
sed -E 's/^hosts:.*/hosts: files dns/' /etc/nsswitch.conf > "$RUN/nsswitch.conf"
RESOLV="$(readlink -f /etc/resolv.conf)"
LAUNCHER=""
cleanup() {
  trap - EXIT TERM INT
  if [ -n "$LAUNCHER" ]; then
    kill -TERM -- "-$LAUNCHER" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 -- "-$LAUNCHER" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$LAUNCHER" 2>/dev/null || true
    wait "$LAUNCHER" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
env -i PATH="/usr/bin:/bin" HOME="$RUN/home" \
  XDG_CONFIG_HOME="$RUN/home/.config" XDG_CACHE_HOME="$RUN/home/.cache" \
  XDG_DATA_HOME="$RUN/home/.local/share" XDG_RUNTIME_DIR="$RUN/home/.cache" \
  LANG="${LANG:-en_US.UTF-8}" VIDBEE_ALLOW_MULTIPLE_INSTANCES=1 \
  VIDBEE_AUTOMATION_DESCRIPTOR="$RUN/automation.json" VIDBEE_MCP_CONFIG="$RUN/mcp.json" \
  setsid unshare -rmn bash -euo pipefail -c '
    ip link set lo up
    mount --bind "$1/resolv.conf" "$2"
    mount --bind "$1/nsswitch.conf" /etc/nsswitch.conf
    python3 -I "$3/dns-logger.py" "$1/dns.log" &
    DNS=$!
    for _ in {1..100}; do
      if grep -q "# dns-logger ready" "$1/dns.log" 2>/dev/null; then break; fi
      kill -0 "$DNS"
      sleep 0.05
    done
    grep -q "# dns-logger ready" "$1/dns.log"
    getent hosts selftest.dns-logger.invalid > /dev/null
    "$0" --no-sandbox --ozone-platform=headless --disable-gpu \
      --user-data-dir="$1/userdata" --remote-debugging-port=9230 > "$1/stdout.log" 2>&1 &
    APP_PID=$!
    printf "%s\n" "$APP_PID" > "$1/app.pid"
    wait "$APP_PID"
    echo "unexpected early app exit" >&2
    exit 1
  ' "$APP/vidbee" "$RUN" "$RESOLV" "$HERE" &
LAUNCHER=$!
printf '%s\n' "$LAUNCHER" > "$RUN/namespace.pid"
for ((i=0; i<SECS*10; i++)); do
  if ! kill -0 "$LAUNCHER" 2>/dev/null; then
    wait "$LAUNCHER" || true
    echo "offline instance exited before its deadline; see $RUN/stdout.log" >&2
    exit 1
  fi
  sleep 0.1
done
echo "completed offline observation; logs under $RUN"
