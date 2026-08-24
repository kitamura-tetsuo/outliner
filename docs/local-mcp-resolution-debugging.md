# Local MCP URL-resolution debugging

This workflow calls the real Streamable HTTP `resolve_url` tool, OAuth access-token verifier,
Firestore ACL discovery, access re-check, Hocuspocus document reader, and page/entity lookup. It
does not add a mock resolver or a write-capable/debug MCP tool.

## Emulator-first workflow

1. Install dependencies and start the normal Firebase services and Outliner server:

   ```sh
   scripts/setup.sh
   cd server
   npm run build
   MCP_LOCAL_DIAGNOSTICS=true \
     OAUTH_ACCESS_TOKEN_SECRET=local-mcp-only-secret \
     FIRESTORE_EMULATOR_HOST=127.0.0.1:58080 \
     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:59099 \
     npm start
   ```

   Use the normal local environment (`FIRESTORE_EMULATOR_HOST=127.0.0.1:58080` and
   `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:59099`). Seed an authorized and unauthorized project
   through existing development infrastructure; do not enable `ALLOW_TEST_ACCESS`, because that
   bypasses the ACL path under investigation.

2. In a second terminal, invoke the real MCP endpoint. The default identity is
   `test@example.com`; an alternative email can be the second argument:

   ```sh
   cd server
   MCP_LOCAL_DIAGNOSTICS=true \
     OAUTH_ACCESS_TOKEN_SECRET=local-mcp-only-secret \
     FIRESTORE_EMULATOR_HOST=127.0.0.1:58080 \
     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:59099 \
     npm run mcp:resolve:local -- \
       'https://outliner-d57b0.web.app/tetsuo/claude%20code'
   ```

   The helper looks up the Firebase UID, creates a short-lived local Outliner OAuth token in
   memory, and sends the MCP JSON-RPC request. It never prints the token. Its output includes the
   correlation `requestId`, selected Firebase mode, a non-sensitive identity suffix, HTTP status,
   and MCP result/error. Match `requestId` against `server/logs/server.log` (or server stdout).
   Resolution diagnostics distinguish `url_parsing`/`url_decoding`, `project_discovery`,
   `project_title_matching`, `authorization_recheck`, and `page_lookup`/`entity_lookup`.

3. Verify an authorized URL and an encoded-space page resolve, then verify a project not granted
   to the identity still fails closed.

This helper validates the post-authentication UID-to-project path only. It deliberately does not
claim that the email/password development user exercised production OAuth. Validate the complete
authorization-code/PKCE flow separately using the dedicated **Google-backed Firebase test
account**, following [the ChatGPT MCP smoke test](chatgpt-mcp-integration.md#reproducible-production-smoke-test).

## Explicit production-Firebase diagnostic mode

Use this only when emulator ACLs do not reproduce legacy production records. Give
`test@example.com` minimum read access first. The mode leaves the server and Yjs persistence local,
but makes Firebase Admin ACL/auth reads target the configured production Firebase project. It
disables development-user setup/data clearing and exposes only the normal seven read-only MCP
tools.

Unset every Firebase emulator variable, provide Firebase Admin credentials through the existing
uncommitted mechanism, and add **all three** deliberate settings to both the server and invocation
shells:

```sh
MCP_LOCAL_DIAGNOSTICS=true \
MCP_FIREBASE_MODE=production \
MCP_PRODUCTION_FIREBASE_CONFIRM=I_UNDERSTAND_THIS_READS_PRODUCTION_FIREBASE \
OAUTH_ACCESS_TOKEN_SECRET="$(cat /path/to/local-only-secret)" \
npm start
```

The server refuses incomplete/conflicting configuration and prints
`WARNING: LOCAL READ-ONLY MCP DIAGNOSTICS ARE CONNECTED TO PRODUCTION FIREBASE` at startup. Run the
same `npm run mcp:resolve:local -- URL [email]` command with the same four variables. Never paste
Firebase credentials, OAuth tokens, or service-account contents into commands committed to the
repository, logs, fixtures, or test output.

If the minimal test identity does not reproduce the legacy ACL shape, grant a dedicated diagnostic
identity the same minimum legacy ACL fixture, or use the authorized legacy identity locally through
the existing credential mechanism. Do not broaden `test@example.com` access merely to mask the
discovery bug. Finally, use the Google-backed test account for complete OAuth validation.
