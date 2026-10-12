#!/usr/bin/env bash
# Build into the isolated test profile; no system addon or application changes.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
target=$1
mkdir -p "$target/lib" "$target/share/fcitx5/addon"
g++ -std=c++17 -Wall -Wextra -Werror -shared -fPIC \
  "$HERE/selection-observer.cpp" $(pkg-config --cflags --libs Fcitx5Core) \
  -o "$target/lib/libnativeimeselection.so"
cat > "$target/share/fcitx5/addon/nativeimeselection.conf" <<'EOF'
[Addon]
Name=Native IME regression selection observer
Type=SharedLibrary
Library=libnativeimeselection
Category=Module
OnDemand=False
EOF
