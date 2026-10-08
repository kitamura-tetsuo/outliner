#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
MODE=${1:?standalone or outliner}
case "$MODE" in standalone|outliner) ;; *) exit 2 ;; esac
export IME_ARTIFACTS=${IME_ARTIFACTS:-$ROOT/job_logs/native-ime}
export IME_STAGE="$MODE"
mkdir -p "$IME_ARTIFACTS/$MODE"
if [[ ${IME_DBUS_SESSION:-0} != 1 ]]; then
  exec dbus-run-session -- env IME_DBUS_SESSION=1 bash "$0" "$MODE"
fi
exec > >(tee "$IME_ARTIFACTS/$MODE/session.log") 2>&1
export DISPLAY=:97 XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 MOZ_ENABLE_WAYLAND=0
export GTK_IM_MODULE=fcitx XMODIFIERS=@im=fcitx QT_IM_MODULE=fcitx
export XDG_CONFIG_HOME="$ROOT/work/native-ime/$MODE/config"
export XDG_CACHE_HOME="$ROOT/work/native-ime/$MODE/cache"
export XDG_RUNTIME_DIR="$ROOT/work/native-ime/$MODE/runtime"
mkdir -p "$XDG_CONFIG_HOME/fcitx5/conf" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
cat > "$XDG_CONFIG_HOME/fcitx5/profile" <<'EOF'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=mozc
[Groups/0/Items/0]
Name=keyboard-us
Layout=
[Groups/0/Items/1]
Name=mozc
Layout=
[GroupOrder]
0=Default
EOF
cat > "$XDG_CONFIG_HOME/fcitx5/config" <<'EOF'
[Behavior]
ActiveByDefault=False
PreeditEnabledByDefault=True
EOF
cat > "$XDG_CONFIG_HOME/fcitx5/conf/classicui.conf" <<'EOF'
Vertical Candidate List=True
Font="Noto Sans CJK JP 16"
PreferTextIcon=False
EOF
pids=()
cleanup() {
  status=$?
  set +e
  fcitx5-diagnose > "$IME_ARTIFACTS/$MODE/fcitx5-diagnose.txt" 2>&1
  xwininfo -root -tree > "$IME_ARTIFACTS/$MODE/final-window-tree.txt" 2>&1
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null; done
  exit "$status"
}
trap cleanup EXIT
Xvfb "$DISPLAY" -screen 0 1600x1000x24 -dpi 96 -nolisten tcp > "$IME_ARTIFACTS/$MODE/xvfb.log" 2>&1 &
pids+=("$!")
for attempt in {1..50}; do
  if xdpyinfo > "$IME_ARTIFACTS/$MODE/xdpyinfo.txt" 2>&1; then break; fi
  sleep .1
done
xdpyinfo >/dev/null
"$ROOT/work/native-ime/venv/bin/python" "$ROOT/scripts/poc/native-ime/validate_x11.py"
openbox > "$IME_ARTIFACTS/$MODE/openbox.log" 2>&1 &
pids+=("$!")
dbus-monitor --session "interface='org.fcitx.Fcitx.InputMethod1'" \
  "interface='org.fcitx.Fcitx.InputContext1'" > "$IME_ARTIFACTS/$MODE/dbus-input.log" 2>&1 &
pids+=("$!")
fcitx5 --disable=ibusfrontend,xim --enable=classicui > "$IME_ARTIFACTS/$MODE/fcitx5.log" 2>&1 &
export IME_FCITX_PID=$!
pids+=("$IME_FCITX_PID")
for attempt in {1..50}; do
  if [[ $(fcitx5-remote 2>/dev/null) =~ ^[12]$ ]]; then break; fi
  sleep .1
done
[[ $(fcitx5-remote) =~ ^[12]$ ]]
fcitx_executable=$(readlink "/proc/$IME_FCITX_PID/exe")
[[ $(basename "$fcitx_executable") == fcitx5 ]]
printf '%s\n' "$fcitx_executable" > "$IME_ARTIFACTS/$MODE/fcitx-process-executable.txt"
dpkg -L fcitx5-frontend-gtk3 > "$IME_ARTIFACTS/$MODE/gtk-module-files.txt"
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$ROOT/scripts/poc/native-ime" \
  > "$IME_ARTIFACTS/$MODE/fixture-server.log" 2>&1 &
pids+=("$!")
"$ROOT/work/native-ime/venv/bin/python" "$ROOT/scripts/poc/native-ime/experiment.py"
