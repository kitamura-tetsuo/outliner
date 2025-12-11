## 2025-02-19 - Hardcoded Admin Token in Functions

**Vulnerability:** A hardcoded secret string acting as an admin token was found directly in the source code of `functions/index.js` protecting a critical data deletion endpoint.
**Learning:** Development speed often leads to "temporary" hardcoded secrets that persist into production. Even "hidden" endpoints can be discovered.
**Prevention:** Enforce a strict "no secrets in code" policy. Use `process.env` from day one, even for prototypes. Implement secret scanning tools in the pre-commit or CI pipeline.
