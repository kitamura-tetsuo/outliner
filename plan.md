1. **Analyze Root Cause**: The service worker in `client/src/service-worker.ts` treats all GET requests identically, storing them indefinitely using a cache-first approach. For HTML navigations, this means returning users are stuck with outdated shell HTML, and the cache size grows unboundedly because every distinct page URL visited is stored permanently.
2. **Import `build` and `files`**: In `client/src/service-worker.ts`, import `build` and `files` from `$service-worker` in addition to `version`.
3. **Pre-cache Assets**: Combine `build` and `files` into the `ASSETS` array to pre-cache the build manifest at install time instead of dynamically accumulating them. We can also include `/` and `/favicon.png`.
4. **Distinguish Requests in Fetch Listener**:
   - Determine if the request is for an immutable asset by checking if the URL pathname starts with `/_app/immutable/`.
   - Don't cache `/api/*` responses at all (if they happen to be GET).
   - If the request mode is "navigate" or it's not immutable, use a network-first strategy (with fallback to cache for offline support).
   - Otherwise (for immutable assets), use a cache-first strategy.
   - For network responses, do not put navigations or non-immutable assets into the permanent runtime cache (or restrict what is put in there) to avoid unbounded growth.
5. **E2E/Unit Assertion**: Write a test to assert that a second load after a version bump serves the new shell (if applicable, though Playwright tests for SWs are sometimes tricky, we can check basic behavior).
6. **Pre-commit**: Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
