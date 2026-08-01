#!/bin/bash
# Verify that the dprint wasm plugins committed under dprint-plugins/ are real
# wasm binaries. They are stored with Git LFS, so a clone made without git-lfs
# installed (or without `git lfs pull`) leaves small pointer files behind and
# dprint fails with a confusing error.
#
# Recovery order:
#   1. `git lfs pull` (works whenever git-lfs is available)
#   2. `npm pack` of the plugin's npm package (works whenever the npm registry
#      is reachable, which is common in sandboxes that block plugins.dprint.dev)
#   3. download from plugins.dprint.dev (only if the network allows it)
# If all three fail the script reports the problem and exits non-zero; callers
# may treat that as a warning.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_DIR="${ROOT_DIR}/dprint-plugins"

# Plugin file name -> npm package spec -> download URL. The npm packages are the
# upstream authors' own releases and every one of them stores the module at
# package/plugin.wasm, so the same extraction path works for all entries. Pin the
# npm version to the version in the file name: the bytes have to stay identical
# or formatting results would drift between clones.
PLUGIN_SOURCES=(
  "typescript-0.95.5.wasm|@dprint/typescript@0.95.5|https://plugins.dprint.dev/typescript-0.95.5.wasm"
  "json-0.20.0.wasm|@dprint/json@0.20.0|https://plugins.dprint.dev/json-0.20.0.wasm"
  "markdown-0.18.0.wasm|@dprint/markdown@0.18.0|https://plugins.dprint.dev/markdown-0.18.0.wasm"
  "toml-0.7.0.wasm|@dprint/toml@0.7.0|https://plugins.dprint.dev/toml-0.7.0.wasm"
  "dockerfile-0.3.2.wasm|@dprint/dockerfile@0.3.2|https://plugins.dprint.dev/dockerfile-0.3.2.wasm"
  "malva-v0.11.2.wasm|dprint-plugin-malva@0.11.2|https://plugins.dprint.dev/g-plane/malva-v0.11.2.wasm"
  "markup_fmt-v0.19.1.wasm|dprint-plugin-markup@0.19.1|https://plugins.dprint.dev/g-plane/markup_fmt-v0.19.1.wasm"
  "pretty_yaml-v0.5.0.wasm|dprint-plugin-yaml@0.5.0|https://plugins.dprint.dev/g-plane/pretty_yaml-v0.5.0.wasm"
)

# A wasm module starts with the magic bytes 0x00 'a' 's' 'm'.
is_wasm() {
  [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "0061736d" ]
}

# Re-evaluate which of the given entries still lack a real wasm file. The result
# lands in the global `missing` array (a nameref would need bash 4.3, and this
# script also runs under the bash 3.2 that ships with macOS).
missing=()
collect_missing() {
  local entry name
  missing=()
  for entry in "$@"; do
    name="${entry%%|*}"
    is_wasm "${PLUGIN_DIR}/${name}" || missing+=("$entry")
  done
}

collect_missing "${PLUGIN_SOURCES[@]}"

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

collect_missing "${missing[@]}"

if [ ${#missing[@]} -eq 0 ]; then
  echo "dprint plugins restored via Git LFS."
  exit 0
fi

mkdir -p "$PLUGIN_DIR"

# Stage 2: the npm registry. Sandboxes routinely allow registry.npmjs.org while
# blocking plugins.dprint.dev, and the plugin authors publish the very same wasm
# modules there. `npm pack` only downloads the tarball, so nothing is installed
# into the repository and no node_modules tree is touched.
if command -v npm >/dev/null 2>&1; then
  echo "Falling back to the npm registry for the missing plugins ..."
  npm_tmp="$(mktemp -d)"
  for entry in "${missing[@]}"; do
    name="${entry%%|*}"
    rest="${entry#*|}"
    spec="${rest%%|*}"
    rm -rf "${npm_tmp:?}"/*
    if ! npm pack "$spec" --silent --pack-destination "$npm_tmp" >/dev/null 2>&1; then
      echo "  npm pack ${spec} failed" >&2
      continue
    fi
    # The directory was just emptied, so the pack produced exactly one tarball.
    # A glob keeps this to shell builtins: `find -maxdepth` is implemented by
    # both GNU and BSD find but is not in POSIX, and globbing needs no such bet.
    tarball=""
    for candidate in "$npm_tmp"/*.tgz; do
      if [ -f "$candidate" ]; then
        tarball="$candidate"
        break
      fi
    done
    if [ -n "$tarball" ] \
      && tar -xzf "$tarball" -C "$npm_tmp" package/plugin.wasm 2>/dev/null \
      && is_wasm "${npm_tmp}/package/plugin.wasm"; then
      mv "${npm_tmp}/package/plugin.wasm" "${PLUGIN_DIR}/${name}"
      echo "  restored ${name} from ${spec}"
    else
      echo "  ${spec} did not yield a usable plugin.wasm" >&2
    fi
  done
  rm -rf "$npm_tmp"
fi

collect_missing "${missing[@]}"

failed=0
if [ ${#missing[@]} -ne 0 ]; then
  echo "Falling back to downloading the plugins from plugins.dprint.dev ..."
  for entry in "${missing[@]}"; do
    name="${entry%%|*}"
    url="${entry##*|}"
    # Download to a temp file: curl -o truncates the destination before it knows
    # whether the request succeeds, which would destroy the LFS pointer that is
    # still checked out at that path.
    if curl -fsSL -o "${PLUGIN_DIR}/${name}.tmp" "$url" && is_wasm "${PLUGIN_DIR}/${name}.tmp"; then
      mv "${PLUGIN_DIR}/${name}.tmp" "${PLUGIN_DIR}/${name}"
      echo "  downloaded ${name}"
    else
      rm -f "${PLUGIN_DIR}/${name}.tmp"
      echo "  failed to obtain ${name}" >&2
      failed=1
    fi
  done
fi

if [ "$failed" -ne 0 ]; then
  cat >&2 <<'EOS'
Could not materialize every dprint plugin. Install git-lfs and run:
  git lfs install --local --manual && git lfs pull --include "dprint-plugins/*"
Or, if the npm registry is reachable, make `npm` available on PATH and re-run
this script so it can pull the plugins from their npm packages instead.
Until then, formatting commands will fail; set SKIP_DPRINT=1 to skip them.
EOS
  exit 1
fi

# When a working LFS clean filter is in place git turns the restored binaries
# back into the pointer files recorded in the index and the tree stays clean.
# Without it git reports all eight as modified, and `git add -A` would then stage
# multi-megabyte blobs as ordinary Git objects. Detect that case from git's own
# verdict and mark the paths skip-worktree. (Undo with:
#   git update-index --no-skip-worktree dprint-plugins/*.wasm)
dirty="$(cd "$ROOT_DIR" && git status --porcelain -- dprint-plugins 2>/dev/null)"
if [ -n "$dirty" ]; then
  for entry in "${PLUGIN_SOURCES[@]}"; do
    name="${entry%%|*}"
    (cd "$ROOT_DIR" && git update-index --skip-worktree "dprint-plugins/${name}" >/dev/null 2>&1) || true
  done
  echo "Git LFS is not usable here; dprint-plugins/*.wasm marked skip-worktree to keep the tree clean."
fi

echo "dprint plugins restored."
exit 0
