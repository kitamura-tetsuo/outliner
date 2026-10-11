#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
uname -a
cat /etc/os-release
apt-get update
apt-get install -y docker.io docker-compose-v2 curl ca-certificates
# Native Linux Engine inside Ubuntu; no Docker Desktop or Windows engine.
if ! docker --host=unix:///var/run/docker.sock info >/dev/null 2>&1; then
  nohup dockerd --host=unix:///var/run/docker.sock >/var/log/outliner-dockerd.log 2>&1 </dev/null &
fi
for attempt in $(seq 1 60); do
  if docker --host=unix:///var/run/docker.sock info >/dev/null 2>&1; then break; fi
  sleep 1
done
docker --host=unix:///var/run/docker.sock info --format 'OSType={{.OSType}} KernelVersion={{.KernelVersion}} ServerVersion={{.ServerVersion}} DockerRootDir={{.DockerRootDir}} Driver={{.Driver}}'
test "$(docker --host=unix:///var/run/docker.sock info --format '{{.OSType}}')" = linux
docker --host=unix:///var/run/docker.sock version
docker compose version
