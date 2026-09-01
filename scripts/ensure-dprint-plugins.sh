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

# The CLI is pinned the same way and decides formatting output just as much, so
# it is verified alongside the plugins.
# Shared source files are imported directly by the client and server. Their
# bare imports therefore resolve through the repository-root node_modules,
# rather than through shared/node_modules. Keep those root runtime packages in
# the same branch-switch guard so a newly added shared dependency cannot leave
# `scripts/test.sh` failing with an opaque Vite import-resolution error.
ROOT_RUNTIME_PACKAGES=("libpg-query")
CHECKED_PACKAGES=("dprint" "${PLUGIN_PACKAGES[@]}" "${ROOT_RUNTIME_PACKAGES[@]}")

# A wasm module starts with the magic bytes 0x00 'a' 's' 'm'.
is_wasm() {
  [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "0061736d" ]
}

json_field() {
  node -p "try{require(process.argv[1])[process.argv[2]]??''}catch(e){''}" "$1" "$2" 2>/dev/null
}

# Names of packages that are absent, or whose installed version differs from the
# exact pin in the root package.json, one per line.
#
# The version check is the point: node_modules/<package>/plugin.wasm carries no
# version, so after a branch switch or a plugin bump the old bytes sit at exactly
# the path the config points at. A presence-only check would happily format with
# them and disagree with CI.
stale_packages() {
  local package pinned installed
  for package in "${CHECKED_PACKAGES[@]}"; do
    pinned="$(node -p \
      "try{const p=require('${ROOT_DIR}/package.json'); p.devDependencies?.['${package}']??p.dependencies?.['${package}']??''}catch(e){''}" \
      2>/dev/null)"
    installed="$(json_field "${ROOT_DIR}/node_modules/${package}/package.json" version)"
    if [ -z "$installed" ] || { [ -n "$pinned" ] && [ "$installed" != "$pinned" ]; }; then
      echo "$package"
    elif [[ " ${PLUGIN_PACKAGES[*]} " == *" ${package} "* ]] \
      && ! is_wasm "${ROOT_DIR}/node_modules/${package}/plugin.wasm"; then
      echo "$package"
    fi
  done
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required for dprint (the CLI is fetched with npx)." >&2
  echo "Install Node.js and run 'npm ci' in ${ROOT_DIR}, or set SKIP_DPRINT=1 to skip formatting." >&2
  exit 1
fi

stale="$(stale_packages)"
if [ -z "$stale" ]; then
  exit 0
fi

echo "dprint packages are missing or out of date; installing the repository-root dependencies ..."
echo "$stale" | sed 's/^/  - /'

# `npm ci` wipes node_modules before it fetches anything, so a failed install
# would take Playwright, pm2 and vitepress down with it. Only use it when there
# is nothing to lose; otherwise `npm install`, which converges on the same exact
# pins (package.json holds no ranges for these) without clearing the tree first.
if [ -d "${ROOT_DIR}/node_modules" ]; then
  (cd "$ROOT_DIR" && npm_config_proxy="" npm_config_https_proxy="" npm install --no-audit --no-fund) || true
else
  (cd "$ROOT_DIR" && npm_config_proxy="" npm_config_https_proxy="" npm ci --no-audit --no-fund) || true
fi

stale="$(stale_packages)"
if [ -n "$stale" ]; then
  echo "Could not install every dprint package. Still missing or mismatched:" >&2
  echo "$stale" | sed 's/^/  - /' >&2
  echo "Run 'npm ci' in ${ROOT_DIR} and check the output; until then, formatting" >&2
  echo "commands will fail. Set SKIP_DPRINT=1 to skip them." >&2
  exit 1
fi

echo "dprint CLI and plugins installed at their pinned versions."
exit 0
