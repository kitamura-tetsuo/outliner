#!/bin/bash
set -e

# Run the setup script to install dependencies and compile the code
/github/workspace/scripts/setup.sh

# Execute the command passed to the entrypoint
exec "$@"
