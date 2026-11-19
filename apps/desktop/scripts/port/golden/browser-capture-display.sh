# Sourced only inside the owned offline namespace. All children share its session.
if command -v Xvfb >/dev/null && command -v xdpyinfo >/dev/null && command -v chromium >/dev/null; then
  for display_number in {90..129}; do
    if [ ! -e "/tmp/.X${display_number}-lock" ] && [ ! -S "/tmp/.X11-unix/X${display_number}" ]; then
      export DISPLAY=":${display_number}"
      Xvfb "$DISPLAY" -screen 0 1280x800x24 -ac -nolisten tcp > "$1/browser-capture-display.log" 2>&1 &
      PROFILE_DISPLAY_PID=$!
      for _ in {1..200}; do
        if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
        kill -0 "$PROFILE_DISPLAY_PID"
        sleep 0.05
      done
      xdpyinfo -display "$DISPLAY" >/dev/null
      break
    fi
  done
fi
