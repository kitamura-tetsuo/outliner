# Fluid to Yjs Mapping

This document outlines the mapping between Azure Fluid Relay data structures and their Yjs equivalents during the migration to Yjs. It also lists known gaps and troubleshooting tips for the CI test environment.

## Data structure mapping

| Fluid (Azure Fluid Relay)   | Yjs                                  | Status      |
| --------------------------- | ------------------------------------ | ----------- |
| SharedMap                   | `Y.Map`                              | complete    |
| SharedString                | `Y.Text`                             | complete    |
| SharedTree                  | `Y.Map` + `Y.Array` nodes            | in progress |
| Fluid service (Tinylicious) | Yjs WebSocket server (`y-websocket`) | replaced    |

## Recent changes

- Removed remaining `TreeSubscriber` and related Fluid classes. Adopted minimal-granularity Yjs observe (Y.Text/Y.Array/Y.Map) for reactive access to Yjs documents.
- Uninstalled Fluid dependencies and deleted Fluid-specific components.
- Added an end-to-end test verifying Yjs store connectivity.

## CI setup

`scripts/setup.sh` starts the Yjs WebSocket server for tests. Tinylicious is never started on Yjs branches.

## Troubleshooting

- **Token refresh**: restart the Yjs server if authentication tokens expire during long test runs.
- **LevelDB persistence**: the server stores data in `yjs-data/`. Remove this directory for a clean state.
- **Offline mode**: when developing without a network connection, start the Yjs server locally and point the client to `ws://localhost:${TEST_YJS_PORT}`.

## Test suite migration

- Unit/integration tests no longer depend on Fluid. They target Yjs services
  or neutral abstractions to avoid legacy coupling.
- Fluid-only scenarios without Yjs equivalents (e.g., Fluid Token endpoint)
  were deleted. The related feature doc was updated to indicate runtime
  validation via hosting/proxy rules rather than client tests.
- A neutral project title provider is used in tests to mock title resolution
  without importing Fluid-specific modules.
