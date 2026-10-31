#!/usr/bin/env bash

set -euo pipefail

# Keep this deliberately small and bounded. apt performs at most two retries for
# each of the two configured Ubuntu archive hosts; every request has a 15-second
# timeout. The second host changes only the transport endpoint--Ubuntu's signed
# Release metadata and package signature verification remain enabled.
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
