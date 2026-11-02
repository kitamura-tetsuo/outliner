#!/usr/bin/env bash
set -o pipefail

if ! ps -eo comm=,args= | awk '$1 == "tinylicious" || ($1 ~ /^node/ && $0 ~ /[/]tinylicious([ /]|$)/) { found=1 } END { exit found }'; then
  echo "Tinylicious process detected or process inspection failed" >&2
  exit 1
fi
if ! ss -H -ltn | awk '$4 ~ /:(7072|7082|7092)$/ { found=1 } END { exit found }'; then
  echo "Legacy listener detected or listener inspection failed" >&2
  exit 1
fi
