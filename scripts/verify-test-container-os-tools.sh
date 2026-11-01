#!/usr/bin/env bash

set -euo pipefail

readonly required_packages=(
    openjdk-21-jre-headless
    xvfb
    lsof
    netcat-openbsd
    curl
    sudo
    python3-venv
    python3-pip
    git-lfs
)

readonly required_commands=(java Xvfb lsof nc curl sudo python3 pip3 git-lfs)

for package in "${required_packages[@]}"; do
    if ! dpkg-query -W -f='${db:Status-Status}\n' "$package" 2>/dev/null | grep -qx installed; then
        echo "Required OS package is not installed: ${package}" >&2
        exit 1
    fi
done

for command_name in "${required_commands[@]}"; do
    if ! command -v "$command_name" >/dev/null; then
        echo "Required OS tool is not available: ${command_name}" >&2
        exit 1
    fi
done

# Exercise the two Python capabilities supplied by separate required packages.
python3 -c 'import venv'
python3 -m pip --version
