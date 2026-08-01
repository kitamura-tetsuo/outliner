#!/bin/bash
# Verify that the dprint wasm plugins committed under dprint-plugins/ are real
# wasm binaries. They are stored with Git LFS, so a clone made without git-lfs
# installed (or without `git lfs pull`) leaves small pointer files behind and
# dprint fails with a confusing error.
#
# Recovery order:
#   1. `git lfs pull` (works whenever git-lfs is available)
#   2. download from plugins.dprint.dev (only if the network allows it)
# If both fail the script reports the problem and exits non-zero; callers may
# treat that as a warning.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_DIR="${ROOT_DIR}/dprint-plugins"

# Plugin file name -> download URL used as the last-resort fallback.
PLUGIN_URLS=(
  "typescript-0.95.5.wasm|https://plugins.dprint.dev/typescript-0.95.5.wasm"
  "json-0.20.0.wasm|https://plugins.dprint.dev/json-0.20.0.wasm"
  "markdown-0.18.0.wasm|https://plugins.dprint.dev/markdown-0.18.0.wasm"
  "toml-0.7.0.wasm|https://plugins.dprint.dev/toml-0.7.0.wasm"
  "dockerfile-0.3.2.wasm|https://plugins.dprint.dev/dockerfile-0.3.2.wasm"
  "malva-v0.11.2.wasm|https://plugins.dprint.dev/g-plane/malva-v0.11.2.wasm"
  "markup_fmt-v0.19.1.wasm|https://plugins.dprint.dev/g-plane/markup_fmt-v0.19.1.wasm"
  "pretty_yaml-v0.5.0.wasm|https://plugins.dprint.dev/g-plane/pretty_yaml-v0.5.0.wasm"
)

# A wasm module starts with the magic bytes 0x00 'a' 's' 'm'.
is_wasm() {
  [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "0061736d" ]
}

missing=()
for entry in "${PLUGIN_URLS[@]}"; do
  name="${entry%%|*}"
  is_wasm "${PLUGIN_DIR}/${name}" || missing+=("$entry")
done

if [ ${#missing[@]} -eq 0 ]; then
  exit 0
fi

echo "dprint plugins are not materialized (${#missing[@]} file(s) are Git LFS pointers or missing)."

if command -v git-lfs >/dev/null 2>&1 || git lfs version >/dev/null 2>&1; then
  # Configure the LFS filters for this clone if they are missing, so the
  # restored binaries are cleaned back into pointers and the working tree stays
  # clean. --manual keeps git-lfs from overwriting scripts/pre_push.sh, which is
  # symlinked as .git/hooks/pre-push and already calls `git lfs pre-push`.
  if ! (cd "$ROOT_DIR" && git config --get filter.lfs.process >/dev/null 2>&1); then
    (cd "$ROOT_DIR" && git lfs install --local --manual >/dev/null 2>&1) || true
  fi

  echo "Restoring dprint-plugins/ from Git LFS ..."
  # Fetch the objects for this path, then expand each pointer through the LFS
  # smudge filter. Expanding explicitly also works when the clone never had the
  # filters configured, which is exactly the broken state we are repairing.
  (cd "$ROOT_DIR" && git lfs pull --include "dprint-plugins/*" >/dev/null 2>&1) || true
  for entry in "${missing[@]}"; do
    name="${entry%%|*}"
    (cd "$ROOT_DIR" && git cat-file -p ":dprint-plugins/${name}" 2>/dev/null \
      | git lfs smudge 2>/dev/null > "${PLUGIN_DIR}/${name}.tmp") || true
    if is_wasm "${PLUGIN_DIR}/${name}.tmp"; then
      mv "${PLUGIN_DIR}/${name}.tmp" "${PLUGIN_DIR}/${name}"
    else
      rm -f "${PLUGIN_DIR}/${name}.tmp"
    fi
  done
fi

still_missing=()
for entry in "${missing[@]}"; do
  name="${entry%%|*}"
  is_wasm "${PLUGIN_DIR}/${name}" || still_missing+=("$entry")
done

if [ ${#still_missing[@]} -eq 0 ]; then
  echo "dprint plugins restored via Git LFS."
  exit 0
fi

echo "Falling back to downloading the plugins from plugins.dprint.dev ..."
mkdir -p "$PLUGIN_DIR"
failed=0
for entry in "${still_missing[@]}"; do
  name="${entry%%|*}"
  url="${entry##*|}"
  if curl -fsSL -o "${PLUGIN_DIR}/${name}" "$url" && is_wasm "${PLUGIN_DIR}/${name}"; then
    echo "  downloaded ${name}"
  else
    rm -f "${PLUGIN_DIR}/${name}"
    echo "  failed to obtain ${name}" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  cat >&2 <<'EOS'
Could not materialize every dprint plugin. Install git-lfs and run:
  git lfs install --local --manual && git lfs pull --include "dprint-plugins/*"
Until then, formatting commands will fail; set SKIP_DPRINT=1 to skip them.
EOS
  exit 1
fi

# When a working LFS clean filter is in place git turns the downloaded binaries
# back into the pointer files recorded in the index and the tree stays clean.
# Without it git reports all eight as modified, and `git add -A` would then stage
# multi-megabyte blobs as ordinary Git objects. Detect that case from git's own
# verdict and mark the paths skip-worktree. (Undo with:
#   git update-index --no-skip-worktree dprint-plugins/*.wasm)
dirty="$(cd "$ROOT_DIR" && git status --porcelain -- dprint-plugins 2>/dev/null)"
if [ -n "$dirty" ]; then
  for entry in "${PLUGIN_URLS[@]}"; do
    name="${entry%%|*}"
    (cd "$ROOT_DIR" && git update-index --skip-worktree "dprint-plugins/${name}" >/dev/null 2>&1) || true
  done
  echo "Git LFS is not usable here; dprint-plugins/*.wasm marked skip-worktree to keep the tree clean."
fi

echo "dprint plugins restored via download."
exit 0
