## 2026-01-24 - IP Spoofing via X-Forwarded-For

**Vulnerability:** Rate limiting logic blindly trusted the first IP in `X-Forwarded-For` header, allowing attackers to bypass limits by sending a spoofed header.
**Learning:** Extracting client IP manually via `split(",")[0]` is a common anti-pattern. Without explicit proxy trust configuration, it's safer to prioritize platform-specific headers like `CF-Connecting-IP` over `X-Forwarded-For`.
**Prevention:** Use a centralized `getClientIp` utility that prioritizes secure headers (Cloudflare, Fly.io, etc.) over `X-Forwarded-For`. Avoid inline string parsing of IP headers.

## 2025-02-19 - Hardcoded Admin Token in Functions

**Vulnerability:** A hardcoded secret string acting as an admin token was found directly in the source code of `functions/index.js` protecting a critical data deletion endpoint.
**Learning:** Development speed often leads to "temporary" hardcoded secrets that persist into production. Even "hidden" endpoints can be discovered.
**Prevention:** Enforce a strict "no secrets in code" policy. Use `process.env` from day one, even for prototypes. Implement secret scanning tools in the pre-commit or CI pipeline.

## 2025-02-18 - Unused Utility Vulnerability

**Vulnerability:** Found XSS vulnerability in `ScrapboxFormatter.tokensToHtml` method. It failed to escape `token.url` in generated `<a>` tags.
**Learning:** Utility libraries often contain unused or legacy methods that are not vetted as rigorously as active code. Even if unused, they pose a risk if adopted later.
**Prevention:** Audit all public methods of utility classes for security, regardless of current usage. Remove unused dangerous methods or fix them.

## 2025-02-18 - [Stored XSS in File Uploads]

**Vulnerability:** File uploads (via `uploadAttachment` Cloud Function) lacked `Content-Type` validation and `Content-Disposition` settings, allowing users to upload HTML/SVG files that execute scripts when viewed (Stored XSS).
**Learning:** Cloud storage uploads default to `inline` disposition if not specified, and often auto-detect content types like `text/html`. Explicitly setting `Content-Disposition` metadata is critical for user-generated content.
**Prevention:** Always enforce `Content-Disposition: attachment` for user uploads unless the file type is strictly validated against a safe allowlist (like images).

## 2025-12-20 - WebSocket Authorization Bypass

**Vulnerability:** The Yjs WebSocket server (`server/`) authenticated users but failed to authorize their access to the requested project/container room. Any authenticated user could connect to any room by guessing the project ID (Authorization Bypass).
**Learning:** Checking _who_ a user is (Authentication) is insufficient; you must also check _what_ they can access (Authorization). WebSocket servers separate from the main API layer often miss these domain-specific permission checks.
**Prevention:** Implement an authorization hook in the WebSocket handshake (e.g., in `setupWSConnection`) that queries the central permission store (Firestore in this case) before accepting the connection.

## 2025-12-21 - Sensitive Data in URL Logs

**Vulnerability:** The WebSocket server received authentication tokens via URL query parameters (`?auth=...`) and logged the full URL when connection errors occurred (e.g., invalid room), leaking valid tokens in server logs.
**Learning:** URLs are often treated as "metadata" and logged freely, but they become sensitive when query parameters carry secrets. This is common in WebSocket handshakes where custom headers are limited.
**Prevention:** Sanitize URLs before logging. Specifically redact known sensitive query parameters like `token`, `auth`, `key`. Use a centralized logger with automatic redaction rules for URL fields.

## 2025-02-23 - Insecure Direct Object Reference in Project/Container Membership

**Vulnerability:** The `saveProject` and `saveContainer` endpoints allowed any authenticated user to add themselves to any existing project/container simply by knowing its ID, without any authorization or invitation check.
**Learning:** "Save" or "Join" endpoints often assume the user is creating a new resource or has already been vetted client-side. Server-side checks must strictly differentiate between "creating new" (allowed) and "joining existing" (restricted).
**Prevention:** In functions that associate users with resources, always check if the resource already exists. If it does, deny the association unless the user is already a member or provides a valid invitation token.

## 2025-05-24 - Production Authentication Bypass via Test Tokens

**Vulnerability:** The WebSocket server's token verification logic (`verifyIdTokenCached`) accepted JWTs signed with `alg: none` if they had a specific structure, intended for testing. This logic was not guarded by an environment check, potentially allowing authentication bypass in production.
**Learning:** Test-specific authentication bypasses (like mocking tokens) must be strictly isolated. Code that "looks like" it handles a specific edge case (like `alg: none`) can inadvertently become a backdoor if not explicitly gated.
**Prevention:** Always wrap test-only logic in strict `process.env.NODE_ENV === 'test'` blocks. Avoid implementing "mock" logic in production-capable code paths; prefer dependency injection or separate test helpers.

## 2025-05-24 - DoS via Unhandled URI Decoding

**Vulnerability:** The server used `decodeURIComponent` on user-supplied URL segments without a try-catch block. Sending a malformed sequence (like `%`) caused an uncaught exception, crashing the entire server process.
**Learning:** `decodeURIComponent` throws errors, unlike many other parsing functions that might return null/undefined. Input validation layers (like `parseRoom`) are the first line of defense and must be bulletproof against malformed inputs.
**Prevention:** Always wrap `decodeURIComponent` (and `JSON.parse`) in try-catch blocks when processing external input. Treat decoding failures as validation errors (return undefined/400).

## 2025-05-25 - Disabled Rate Limiting by Default

**Vulnerability:** The server configuration defaulted to 1,000,000 connections/requests per IP, effectively disabling DoS protection.
**Learning:** Default values in configuration schemas (like Zod) are often set to "permissive" values during development to avoid friction, but these defaults can dangerously persist into production if not explicitly overridden.
**Prevention:** Set secure, restrictive defaults in code (secure-by-default). Use environment variables to relax limits for specific environments (dev/test) if needed, rather than the other way around.

## 2025-05-26 - Hardcoded Sentry DSN

**Vulnerability:** The Sentry DSN was hardcoded in `functions/index.js` as a fallback, exposing configuration details and preventing clean environment isolation.
**Learning:** Hardcoding "non-secret" configuration like DSNs still couples code to specific environments/accounts and makes open-sourcing or forking difficult. It also risks sending dev/test errors to production projects.
**Prevention:** Initialize third-party services (Sentry, Analytics) strictly conditionally based on the presence of their specific environment variables. Fail/log gracefully if missing.

## 2026-01-25 - Production Misconfiguration Risks

**Vulnerability:** The server exposes detailed environment information and headers via the `/health` endpoint and allows bypassing authentication via `ALLOW_TEST_ACCESS` without guarding against production deployment.
**Learning:** Default "debug" endpoints and test flags are significant risks in production if not explicitly guarded. Testing flags often get carried into production via environment variables or container configurations.
**Prevention:** Explicitly check `NODE_ENV === 'production'` to guard sensitive endpoints and fail startup if dangerous test flags are detected in production.

## 2026-02-23 - Timing Attack on Admin Authentication

**Vulnerability:** The `deleteAllProductionData` function used `!==` string comparison for verifying the admin token, allowing potential timing attacks to brute-force the secret.
**Learning:** Standard string comparisons (like `==`, `===`) leak timing information based on the number of matching characters. For sensitive operations like verifying secrets, this can be exploited.
**Prevention:** Use `crypto.timingSafeEqual` (or similar constant-time comparison functions) for all secret verifications. Ensure buffer lengths are checked first to prevent errors or length leaks.

## 2026-02-24 - Lack of Identity Verification on Critical Endpoint

**Vulnerability:** The `deleteAllProductionData` endpoint relied solely on a shared secret (`adminToken`) for authorization, without verifying the identity of the caller (missing `idToken` check).
**Learning:** Shared secrets are prone to leakage and do not provide non-repudiation. A leaked secret allows anonymous attackers to perform critical actions.
**Prevention:** Always layer authentication (checking "who") on top of authorization (checking "what"). For critical administrative actions, require both a strong authenticated session (Admin ID Token) and the specific secret/confirmation code.

## 2026-02-25 - Authorization Bypass via User-Writable Collections

**Vulnerability:** The WebSocket server authorized project access by checking the `userProjects` collection, which was writable by any authenticated user. An attacker could add any project ID to their own `userProjects` document to bypass authorization checks.
**Learning:** Authorization checks must effectively consult a "Source of Truth" that is immutable by regular users (e.g., `projectUsers` or ACL lists). Relying on user-profile data that the user can edit effectively delegates authorization decisions to the user.
**Prevention:** Only trust server-side resource permission lists (like `projectUsers`) for authorization. Remove or ignore legacy user-centric collections (like `userProjects`) if they are writable by users.

## 2026-02-04 - Authorization Bypass in Seed API

**Vulnerability:** The `/api/seed` endpoint allowed any authenticated user to overwrite data of existing projects because it lacked an authorization check against the `projectUsers` collection.
**Learning:** Utility/Setup endpoints often lack the rigorous checks of main endpoints. Even if an endpoint is intended for "initialization", it must check if the resource already exists and enforce permissions if it does.
**Prevention:** Enforce ACL checks on all state-modifying endpoints. Distinguish clearly between "create" (allow if not exists) and "update" (require permission) operations.

## 2026-02-07 - DoS via Unbounded Input in Seed API

**Vulnerability:** The `/api/seed` endpoint accepted arbitrary-length strings for `projectName` and arrays for `pages`/`lines` without validation limits. This exposed the server to Denial of Service (DoS) attacks via memory exhaustion or CPU consumption in hashing loops.
**Learning:** Validation libraries like Zod make it easy to define types (e.g., `z.string()`), but developers often forget to add operational limits (e.g., `.max(255)`). Default web server limits (like 100kb body size) are a safety net but insufficient defense-in-depth for complex structured data.
**Prevention:** Always add explicit length and count limits to all variable-size inputs (strings, arrays) in API schemas. Assume inputs can be malicious or accidentally huge.
