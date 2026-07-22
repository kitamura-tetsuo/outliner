1. Delete orphaned comment in `client/src/lib/yjs/connection.ts` and remove references to unused env variables.
    - Specifically, delete lines 82-97 in `client/src/lib/yjs/connection.ts`.
    - I've already cleared `VITE_YJS_FORCE_WS`, `VITE_YJS_DISABLE_WS` and `VITE_YJS_ENABLE_WS` from `client/e2e` files and `client/src/lib/yjs/testHelpers.ts`, so this step is essentially done, just need to remove the comment.
2. Remove server-side token extraction from the URL query string.
    - In `server/src/websocket-auth.ts`, delete `extractAuthToken` function.
    - In `server/src/server.ts`, remove `extractAuthToken` usage: change `data.token || extractAuthToken(request)` to just `data.token`.
    - Update comment at `server/src/server.ts:433-439` to reflect reality (the token is sent in the initial HTTP upgrade URL is false).
    - Remove the two tests in `server/tests/websocket-auth.test.ts:42-50` that exercise `extractAuthToken`.
3. Token cache improvements.
    - Change `tokenCache` to an LRU cache by installing `lru-cache` in `server` and using it in `server/src/websocket-auth.ts`.
    - Note that we should probably just use `lru-cache` for pruning via TTL natively, eliminating the need to do `pruneExpiredTokens`.
4. Complete pre commit steps
    - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. Submit changes via PR.
