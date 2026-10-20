#!/usr/bin/env bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
case_name=${1:-}
case "$case_name" in
  fresh|repeat|downgrade|install-failure) ;;
  *) echo "usage: $0 fresh|repeat|downgrade|install-failure" >&2; exit 2 ;;
esac

export IME_ARTIFACTS=${IME_ARTIFACTS:-$ROOT/job_logs/native-ime-setup/$case_name}
mkdir -p "$IME_ARTIFACTS"

run_setup() {
  bash "$ROOT/scripts/poc/native-ime/setup.sh"
}

verify_installed_firefox() {
  local candidate installed executable
  candidate=$(LC_ALL=C apt-cache policy firefox | awk '/^[[:space:]]*Candidate:/ {print $2; exit}')
  installed=$(dpkg-query -W -f='${Status}\t${Version}' firefox)
  test "$installed" = "$(printf 'install ok installed\t%s' "$candidate")"
  test "$(command -v firefox)" = /usr/bin/firefox
  dpkg-query -L firefox | grep -Fx /usr/bin/firefox
  executable=$(readlink -f /usr/bin/firefox)
  dpkg-query -L firefox | grep -Fx "$executable"
  /usr/bin/firefox --version
}

prepare_higher_fixture() {
  local authentic fixture_version workspace deb unpacked
  authentic=$(dpkg-query -W -f='${Version}' firefox)
  fixture_version="${authentic}+nativeimefixture1"
  dpkg --compare-versions "$fixture_version" gt "$authentic"
  workspace=$(mktemp -d)
  (
    cd "$workspace"
    apt-get download "firefox=$authentic"
    deb=$(find . -maxdepth 1 -name 'firefox_*.deb' -print -quit)
    test -n "$deb"
    sha256sum "$deb" | tee "$IME_ARTIFACTS/authentic-firefox-deb.sha256"
    unpacked="$workspace/repacked"
    dpkg-deb --raw-extract "$deb" "$unpacked"
    sed -i "s/^Version: .*/Version: $fixture_version/" "$unpacked/DEBIAN/control"
    dpkg-deb --build "$unpacked" "$workspace/firefox-higher-fixture.deb"
    sudo dpkg -i "$workspace/firefox-higher-fixture.deb"
  )
  printf 'Package: firefox\nPin: version %s\nPin-Priority: 1001\n' "$authentic" |
    sudo tee /etc/apt/preferences.d/native-ime-firefox-fixture
  LC_ALL=C apt-cache policy firefox | tee "$IME_ARTIFACTS/fixture-policy.txt"
  test "$(LC_ALL=C apt-cache policy firefox | awk '/^[[:space:]]*Candidate:/ {print $2; exit}')" = "$authentic"
  LC_ALL=C apt-get --simulate install "firefox=$authentic" | tee "$IME_ARTIFACTS/fixture-simulation.txt"
  grep -Eq 'DOWNGRADED|DOWNGRADE|downgraded' "$IME_ARTIFACTS/fixture-simulation.txt"
}

case "$case_name" in
  fresh)
    sudo apt-get purge -y firefox || true
    run_setup
    verify_installed_firefox
    ;;
  repeat)
    sudo apt-get purge -y firefox || true
    run_setup
    verify_installed_firefox
    run_setup
    verify_installed_firefox
    ;;
  downgrade)
    run_setup
    prepare_higher_fixture
    run_setup
    verify_installed_firefox
    ;;
  install-failure)
    run_setup
    prepare_higher_fixture
    sudo apt-mark hold firefox
    if bash "$ROOT/scripts/poc/native-ime/setup.sh"; then
      echo "held Firefox unexpectedly produced a successful setup" >&2
      exit 1
    fi
    test -s "$IME_ARTIFACTS/firefox-failure.txt"
    grep -F 'stage=firefox-installation' "$IME_ARTIFACTS/firefox-failure.txt"
    test "$(apt-mark showhold | grep -Fx firefox)" = firefox
    ;;
esac
