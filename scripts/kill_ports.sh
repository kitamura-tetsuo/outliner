#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# kill_ports.sh
# Terminates any process listening on the ports listed in PORTS_TO_KILL.
# Uses lsof to discover PIDs and sends SIGKILL (-9) to each.
# -----------------------------------------------------------------------------

set -euo pipefail

# List of ports to clean up
PORTS_TO_KILL=(
  7070 7071 7072
  7080 7081 7082
  7090 7091 7092
  54000 59099 58080 57070
  4400 9099 8080 9323
)

success_count=0

echo "Starting cleanup of development processes..."

# Iterate over each port and attempt to kill associated processes
for port in "${PORTS_TO_KILL[@]}"; do
  echo "Checking for processes on port ${port}..."

  # Fetch PIDs listening on this port; suppress errors if none found
  pids=$(lsof -ti ":${port}" 2>/dev/null || true)

  if [[ -n "${pids}" ]]; then
    echo "Found PIDs on port ${port}: ${pids}"

    # shellcheck disable=SC2086  # intentional word splitting for kill
    kill -9 ${pids} 2>/dev/null || true

    echo "Killed all processes on port ${port}"
    ((success_count++))
  else
    echo "No process found on port ${port}"
  fi
done

echo "Cleanup completed. Successfully processed ${success_count}/${#PORTS_TO_KILL[@]} ports."
