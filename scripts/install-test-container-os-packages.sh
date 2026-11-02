#!/usr/bin/env bash

set -euo pipefail

# The complete acquisition path has a 180-second wall-clock budget, including
# both archive hosts and every apt update/install retry. Individual requests
# retain shorter transport timeouts so their native source/stage errors are
# normally reported before the aggregate deadline. The second host changes only
# the transport endpoint--Ubuntu's signed Release metadata and package signature
# verification remain enabled.
readonly acquisition_budget_seconds="${APT_ACQUISITION_BUDGET_SECONDS:-180}"
readonly primary_host="${APT_PRIMARY_HOST:-azure.archive.ubuntu.com}"
readonly fallback_host="${APT_FALLBACK_HOST:-archive.ubuntu.com}"
readonly apt_options=(
    -o Acquire::Retries=2
    -o Acquire::http::Timeout=15
    -o Acquire::https::Timeout=15
    -o Acquire::ForceIPv4=true
)

if (( $# == 0 )); then
    echo "usage: $0 PACKAGE [PACKAGE ...]" >&2
    exit 64
fi

if [[ ! "$acquisition_budget_seconds" =~ ^[1-9][0-9]*$ ]]; then
    echo "APT_ACQUISITION_BUDGET_SECONDS must be a positive integer." >&2
    exit 64
fi

# Run the complete production acquisition path under one deadline. The private
# worker mode avoids applying a fresh budget to each fallback attempt.
if [[ $1 != "--bounded-acquisition-worker" ]]; then
    set +e
    timeout --signal=TERM --kill-after=5 "$acquisition_budget_seconds" \
        "$0" --bounded-acquisition-worker "$@"
    status=$?
    set -e
    if (( status == 124 || status == 137 )); then
        echo "APT package acquisition exceeded its ${acquisition_budget_seconds}-second aggregate budget." >&2
        exit 1
    fi
    exit "$status"
fi
shift

replace_archive_host() {
    local from=$1
    local to=$2
    local source

    while IFS= read -r -d '' source; do
        sed -i "s#${from//./\\.}#${to}#g" "$source"
    done < <(find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0)
}

install_from_current_source() {
    local label=$1
    shift
    echo "APT acquisition attempt: ${label}" >&2
    rm -rf /var/lib/apt/lists/*
    apt-get "${apt_options[@]}" update
    apt-get "${apt_options[@]}" install -y --no-install-recommends "$@"
}

if ! install_from_current_source "primary host ${primary_host}" "$@"; then
    echo "Primary APT source failed; retrying once through ${fallback_host}." >&2
    replace_archive_host "$primary_host" "$fallback_host"
    if ! install_from_current_source "fallback host ${fallback_host}" "$@"; then
        echo "APT package acquisition exhausted the bounded primary and fallback attempts." >&2
        exit 1
    fi
fi

# Fail closed even if apt is accidentally wrapped or changed to suppress an
# install error: every requested dependency must be registered as installed.
missing=0
for package in "$@"; do
    if ! dpkg-query -W -f='${db:Status-Status}\n' "$package" 2>/dev/null | grep -qx 'installed'; then
        echo "Required OS dependency is not installed: ${package}" >&2
        missing=1
    fi
done
(( missing == 0 )) || exit 1

rm -rf /var/lib/apt/lists/*
