#!/bin/bash
# Make sure dprint's wasm plugins are present before a formatting command runs.
#
# The plugins are ordinary npm devDependencies of the repository root, and
# dprint.json / functions/dprint.json reference them straight out of
# node_modules/. So "restoring" them is just installing the root dependencies —
# there is no separate download step, no vendored binary, and no Git LFS.
#
# Historically these were committed as Git LFS objects under dprint-plugins/ so
# that formatting would survive a blocked plugins.dprint.dev. That never bought
# anything: the dprint CLI itself comes from npm, so a clone without npm access
# could not format either way. Sourcing both from npm keeps the CLI and the
# plugins pinned in one place (package.json + package-lock.json), and npm
# verifies the bytes against the lockfile's integrity hashes.
#
# Exits non-zero if the plugins still cannot be found; callers may treat that as
# a warning and skip formatting.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Every plugin package stores its module at package/plugin.wasm.
PLUGIN_PACKAGES=(
  "@dprint/typescript"
  "@dprint/json"
  "@dprint/markdown"
  "@dprint/toml"
  "@dprint/dockerfile"
  "dprint-plugin-malva"
  "dprint-plugin-markup"
  "dprint-plugin-yaml"
)

# A wasm module starts with the magic bytes 0x00 'a' 's' 'm'.
is_wasm() {
  [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "0061736d" ]
}

missing_count() {
  local package count=0
  for package in "${PLUGIN_PACKAGES[@]}"; do
    is_wasm "${ROOT_DIR}/node_modules/${package}/plugin.wasm" || count=$((count + 1))
  done
  echo "$count"
}

if [ "$(missing_count)" -eq 0 ]; then
  exit 0
fi

echo "dprint plugins are not installed ($(missing_count) of ${#PLUGIN_PACKAGES[@]} missing); running npm ci in the repository root ..."

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not on PATH, so the dprint plugins cannot be installed." >&2
  echo "Install Node.js and run 'npm ci' in ${ROOT_DIR}, or set SKIP_DPRINT=1 to skip formatting." >&2
  exit 1
fi

# `npm ci` reproduces package-lock.json exactly, which is what keeps every clone
# on identical plugin bytes. Fall back to `npm install` only if the lockfile is
# absent, which should not happen in a normal clone.
if [ -f "${ROOT_DIR}/package-lock.json" ]; then
  (cd "$ROOT_DIR" && npm_config_proxy="" npm_config_https_proxy="" npm ci --no-audit --no-fund) || true
else
  (cd "$ROOT_DIR" && npm_config_proxy="" npm_config_https_proxy="" npm install --no-audit --no-fund) || true
fi

if [ "$(missing_count)" -ne 0 ]; then
  cat >&2 <<EOS
Could not install every dprint plugin. Run 'npm ci' in ${ROOT_DIR} and check the
output; until then, formatting commands will fail. Set SKIP_DPRINT=1 to skip them.
EOS
  exit 1
fi

echo "dprint plugins installed."
exit 0
