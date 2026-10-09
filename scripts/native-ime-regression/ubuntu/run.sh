#!/usr/bin/env bash
# Native Ubuntu/X11 + Firefox + Fcitx5 (GTK frontend, Mozc) regression for Issue #5501.
# Prerequisites: scripts/poc/native-ime/setup.sh (Firefox, Fcitx5, Mozc, Selenium) and the
# application under test serving http://127.0.0.1:7090 from this checkout.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
HERE="$ROOT/scripts/native-ime-regression/ubuntu"
export IME_ARTIFACTS=${IME_ARTIFACTS:-$ROOT/job_logs/native-ime-regression/ubuntu}
mkdir -p "$IME_ARTIFACTS"
if [[ ${IME_DBUS_SESSION:-0} != 1 ]]; then
  exec dbus-run-session -- env IME_DBUS_SESSION=1 bash "$0" "$@"
fi
exec > >(tee "$IME_ARTIFACTS/session.log") 2>&1
export DISPLAY=:97 XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 MOZ_ENABLE_WAYLAND=0
export GTK_IM_MODULE=fcitx XMODIFIERS=@im=fcitx QT_IM_MODULE=fcitx
# Mozc's IPC socket path must stay short, so the isolated profile lives under /tmp.
WORK=$(mktemp -d /tmp/native-ime.XXXXXX)
export XDG_CONFIG_HOME="$WORK/config" XDG_CACHE_HOME="$WORK/cache" XDG_RUNTIME_DIR="$WORK/runtime"
mkdir -p "$XDG_CONFIG_HOME/fcitx5/conf" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
# The reported configuration: Mozc through the GTK frontend with inline preedit enabled.
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
cp "$XDG_CONFIG_HOME/fcitx5/profile" "$XDG_CONFIG_HOME/fcitx5/config" "$IME_ARTIFACTS/" 2>/dev/null || true
pids=()
cleanup() {
  status=$?
  set +e
  fcitx5-diagnose > "$IME_ARTIFACTS/fcitx5-diagnose.txt" 2>&1
  xwininfo -root -tree > "$IME_ARTIFACTS/final-window-tree.txt" 2>&1
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null; done
  # Fcitx5 starts mozc_server on demand; stop it before removing the profile it writes to.
  pkill -u "$(id -u)" -x mozc_server 2>/dev/null
  sleep .5
  rm -rf "$WORK" 2>/dev/null
  exit "$status"
}
trap cleanup EXIT
# A tall desktop keeps room for the 424px native list below every item the runs create, so
# desktop-edge relocation of the panel cannot occur; the Firefox window geometry is fixed.
Xvfb "$DISPLAY" -screen 0 1600x1600x24 -dpi 96 -nolisten tcp > "$IME_ARTIFACTS/xvfb.log" 2>&1 &
pids+=("$!")
for attempt in {1..50}; do
  if xdpyinfo > "$IME_ARTIFACTS/xdpyinfo.txt" 2>&1; then break; fi
  sleep .1
done
xdpyinfo >/dev/null
openbox > "$IME_ARTIFACTS/openbox.log" 2>&1 &
pids+=("$!")
fcitx5 --disable=ibusfrontend,xim --enable=classicui > "$IME_ARTIFACTS/fcitx5.log" 2>&1 &
export IME_FCITX_PID=$!
pids+=("$IME_FCITX_PID")
for attempt in {1..50}; do
  if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
      --method org.freedesktop.DBus.NameHasOwner org.fcitx.Fcitx5 | grep -q true; then break; fi
  kill -0 "$IME_FCITX_PID"
  sleep .1
done
owner_pid=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
  --method org.freedesktop.DBus.GetConnectionUnixProcessID org.fcitx.Fcitx5 | sed -E 's/.*uint32 ([0-9]+).*/\1/')
[[ "$owner_pid" == "$IME_FCITX_PID" ]]
{
  firefox --version
  fcitx5 --version
  dpkg-query -W firefox fcitx5 fcitx5-frontend-gtk3 fcitx5-mozc mozc-server xvfb openbox 2>/dev/null
  echo "display: 1600x1600x24 @ 96 DPI, Firefox layout.css.devPixelsPerPx=1.0"
} > "$IME_ARTIFACTS/versions.txt" 2>&1
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$HERE" > "$IME_ARTIFACTS/reference-server.log" 2>&1 &
pids+=("$!")
"$ROOT/work/native-ime/venv/bin/python" "$HERE/regression.py"
