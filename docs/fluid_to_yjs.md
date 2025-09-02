# Fluid to Yjs Mapping

This document outlines the mapping between Azure Fluid Relay data structures and their Yjs equivalents during the migration to Yjs. It also lists known gaps and troubleshooting tips for the CI test environment.

## Data structure mapping

| Fluid (Azure Fluid Relay)   | Yjs                                  | Status      |
| --------------------------- | ------------------------------------ | ----------- |
| SharedMap                   | `Y.Map`                              | complete    |
| SharedString                | `Y.Text`                             | complete    |
| SharedTree                  | `Y.Map` + `Y.Array` nodes            | in progress |
| Fluid service (Tinylicious) | Yjs WebSocket server (`y-websocket`) | replaced    |

## CI setup

`scripts/codex-setup.sh` starts the Yjs WebSocket server for tests. Tinylicious is never started on Yjs branches.

## Troubleshooting

- **Token refresh**: restart the Yjs server if authentication tokens expire during long test runs.
- **LevelDB persistence**: the server stores data in `yjs-data/`. Remove this directory for a clean state.
- **Offline mode**: when developing without a network connection, start the Yjs server locally and point the client to `ws://localhost:${TEST_YJS_PORT}`.
