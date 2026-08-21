[Issues]
Several E2E API tests were failing with `ECONNREFUSED` errors when attempting to connect to the Firebase Hosting emulator on `http://127.0.0.1:57000`. The hosting emulator was configured to listen on `0.0.0.0`, but the tests were hardcoded to `127.0.0.1`, which caused connection refusals in the test environment.

[Changes]
Updated the host IP in the affected E2E test files (`api-admin-check-for-project-user-listing-bada0e86.spec.ts`, `api-admin-user-list-569aaa6c.spec.ts`, `api-firebase-emulator-startup-standby-function-c9fa9c85.spec.ts`, `api-fixing-firebase-functions-api-server-9e65d78b.spec.ts`, `log-development-log-service-8f761bd4.spec.ts`, and `project-deletion.spec.ts`) from `127.0.0.1` to `0.0.0.0` for requests targeting port `57000`.
Also ensured `/api/health` and other rewritten paths match the ones configured in `firebase.json` for the Firebase Hosting Emulator.

[Verification Results]
Ran the full E2E test suite locally and verified that all API-related tests now pass successfully. Verified that no core logic in Yjs or app stores was touched. Pre-commit formatting checks run successfully.
