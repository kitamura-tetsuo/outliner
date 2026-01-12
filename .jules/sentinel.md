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
