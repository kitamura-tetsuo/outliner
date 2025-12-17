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
