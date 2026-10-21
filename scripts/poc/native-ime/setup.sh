#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
ARTIFACTS=${IME_ARTIFACTS:-$ROOT/job_logs/native-ime}
mkdir -p "$ARTIFACTS" "$ROOT/work/native-ime"
exec > >(tee "$ARTIFACTS/setup.log") 2>&1
stage=initial-inventory
record_firefox_state() {
  local label=$1
  {
    echo "stage=$stage"
    echo "label=$label"
    dpkg-query -W -f='installed=${Status}\nversion=${Version}\n' firefox 2>&1 || true
    LC_ALL=C apt-cache policy firefox 2>&1 || true
  } > "$ARTIFACTS/firefox-$label.txt"
}
setup_failure() {
  local status=$?
  trap - ERR
  set +e
  echo "Native IME setup failed during stage: $stage (status $status)" >&2
  record_firefox_state failure
  exit "$status"
}
trap setup_failure ERR
record_firefox_state before
# Ubuntu's archive Firefox is a Snap transition. Install Mozilla's desktop deb,
# not Snap, Playwright's patched Firefox, or a different browser engine.
stage=prerequisite-packages
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg dbus-x11 xvfb openbox \
  xdotool x11-utils x11-apps python3-venv python3-xlib \
  fcitx5 fcitx5-frontend-gtk3 fcitx5-mozc fonts-noto-cjk
stage=mozilla-signing-key
curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg > "$ROOT/work/native-ime/mozilla.asc"
mkdir -p "$ROOT/work/native-ime/gnupg"
chmod 700 "$ROOT/work/native-ime/gnupg"
fingerprint=$(gpg --homedir "$ROOT/work/native-ime/gnupg" --show-keys --with-colons "$ROOT/work/native-ime/mozilla.asc" | awk -F: '$1 == "fpr" {print $10; exit}')
test "$fingerprint" = 35BAA0B33E9EB396F59CA838C0BA5CE6DC6315A3
stage=mozilla-repository
sudo install -m 644 "$ROOT/work/native-ime/mozilla.asc" /usr/share/keyrings/native-ime-mozilla.asc
echo 'deb [signed-by=/usr/share/keyrings/native-ime-mozilla.asc] https://packages.mozilla.org/apt mozilla main' | sudo tee /etc/apt/sources.list.d/native-ime-mozilla.list
printf 'Package: firefox\nPin: origin packages.mozilla.org\nPin-Priority: 1001\n' | sudo tee /etc/apt/preferences.d/native-ime-mozilla
sudo apt-get update --error-on=any
stage=firefox-candidate
LC_ALL=C apt-cache policy firefox | tee "$ARTIFACTS/firefox-candidate-policy.txt"
firefox_candidate=$(LC_ALL=C apt-cache policy firefox | awk '/^[[:space:]]*Candidate:/ {print $2; exit}')
test -n "$firefox_candidate" && test "$firefox_candidate" != '(none)'
LC_ALL=C apt-cache policy firefox | awk -v candidate="$firefox_candidate" '
  /^[[:space:]]+(\*\*\*[[:space:]]+)?[^[:space:]]+[[:space:]]+[0-9]+$/ {
    version = ($1 == "***" ? $2 : $1)
    selected = (version == candidate)
    next
  }
  selected && /https:\/\/packages\.mozilla\.org\/apt/ { found = 1 }
  END { exit(found ? 0 : 1) }
'
stage=firefox-installation
# Downgrade permission is intentionally local to this exact, authenticated Firefox
# candidate. It is never applied to prerequisite or dependency installations.
sudo apt-get install -y --allow-downgrades "firefox=$firefox_candidate"
stage=firefox-executable-verification
installed_firefox=$(dpkg-query -W -f='${Status}\t${Version}' firefox)
test "$installed_firefox" = "$(printf 'install ok installed\t%s' "$firefox_candidate")"
test "$(command -v firefox)" = /usr/bin/firefox
dpkg-query -L firefox | grep -Fx /usr/bin/firefox
firefox_executable=$(readlink -f /usr/bin/firefox)
dpkg-query -L firefox | grep -Fx "$firefox_executable"
/usr/bin/firefox --version | tee "$ARTIFACTS/firefox-version.txt"
record_firefox_state after
stage=python-and-geckodriver
python3 -m venv --system-site-packages "$ROOT/work/native-ime/venv"
"$ROOT/work/native-ime/venv/bin/pip" install 'selenium==4.29.0' 'Pillow==11.1.0'
curl -fsSL https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-linux64.tar.gz \
  -o "$ROOT/work/native-ime/geckodriver.tar.gz"
tar -xzf "$ROOT/work/native-ime/geckodriver.tar.gz" -C "$ROOT/work/native-ime"
stage=final-evidence
dpkg-query -W firefox fcitx5 fcitx5-frontend-gtk3 fcitx5-mozc xvfb > "$ARTIFACTS/packages.txt"
apt-cache policy firefox > "$ARTIFACTS/firefox-distribution.txt"
fcitx5 --version > "$ARTIFACTS/fcitx5-version.txt"
trap - ERR
