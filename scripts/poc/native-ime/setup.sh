#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
ARTIFACTS=${IME_ARTIFACTS:-$ROOT/job_logs/native-ime}
mkdir -p "$ARTIFACTS" "$ROOT/work/native-ime"
exec > >(tee "$ARTIFACTS/setup.log") 2>&1
# Ubuntu's archive Firefox is a Snap transition. Install Mozilla's desktop deb,
# not Snap, Playwright's patched Firefox, or a different browser engine.
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg dbus-x11 xvfb openbox \
  xdotool x11-utils x11-apps python3-venv python3-xlib \
  fcitx5 fcitx5-frontend-gtk3 fcitx5-mozc fonts-noto-cjk
curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg > "$ROOT/work/native-ime/mozilla.asc"
mkdir -p "$ROOT/work/native-ime/gnupg"
chmod 700 "$ROOT/work/native-ime/gnupg"
fingerprint=$(gpg --homedir "$ROOT/work/native-ime/gnupg" --show-keys --with-colons "$ROOT/work/native-ime/mozilla.asc" | awk -F: '$1 == "fpr" {print $10; exit}')
test "$fingerprint" = 35BAA0B33E9EB396F59CA838C0BA5CE6DC6315A3
sudo install -m 644 "$ROOT/work/native-ime/mozilla.asc" /usr/share/keyrings/native-ime-mozilla.asc
echo 'deb [signed-by=/usr/share/keyrings/native-ime-mozilla.asc] https://packages.mozilla.org/apt mozilla main' | sudo tee /etc/apt/sources.list.d/native-ime-mozilla.list
printf 'Package: *\nPin: origin packages.mozilla.org\nPin-Priority: 1000\n' | sudo tee /etc/apt/preferences.d/native-ime-mozilla
sudo apt-get update
sudo apt-get install -y firefox
python3 -m venv --system-site-packages "$ROOT/work/native-ime/venv"
"$ROOT/work/native-ime/venv/bin/pip" install 'selenium==4.29.0' 'Pillow==11.1.0'
curl -fsSL https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-linux64.tar.gz \
  -o "$ROOT/work/native-ime/geckodriver.tar.gz"
tar -xzf "$ROOT/work/native-ime/geckodriver.tar.gz" -C "$ROOT/work/native-ime"
dpkg-query -W firefox fcitx5 fcitx5-frontend-gtk3 fcitx5-mozc xvfb > "$ARTIFACTS/packages.txt"
apt-cache policy firefox > "$ARTIFACTS/firefox-distribution.txt"
firefox --version > "$ARTIFACTS/firefox-version.txt"
fcitx5 --version > "$ARTIFACTS/fcitx5-version.txt"
