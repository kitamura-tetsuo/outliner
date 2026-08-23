# ChatGPT remote MCP operator guide

Outliner exposes a **read-only** Streamable HTTP MCP server and an OAuth 2.0
authorization-code bridge. The connected identity is the Firebase `uid` from a
Google-backed Firebase Auth sign-in, and every project read uses the existing
`projectUsers`/`checkContainerAccess()` authorization path.

## Public routes

Publish one HTTPS origin, referred to below as `https://outliner.example.com`:

- MCP server URL: `https://outliner.example.com/mcp`
- OAuth authorization: `https://outliner.example.com/oauth/authorize`
- OAuth token and refresh: `https://outliner.example.com/oauth/token`
- OAuth metadata: `https://outliner.example.com/.well-known/oauth-authorization-server`
- OIDC-compatible metadata: `https://outliner.example.com/.well-known/openid-configuration`
- MCP protected-resource metadata: `https://outliner.example.com/.well-known/oauth-protected-resource`
- Dynamic client registration: `https://outliner.example.com/oauth/register`

Cloudflare Tunnel must forward that hostname to the Outliner server, either
directly or through Traefik. The proxy must preserve HTTPS host/protocol
forwarding headers and must route `/mcp`, `/oauth/*`, and `/.well-known/*` to
the same server process. Do not expose a separate authorization implementation.
Unauthenticated `/mcp` responses advertise protected-resource metadata through
the standard `WWW-Authenticate` challenge, which lets ChatGPT discover the
authorization server from the MCP URL alone.

## Configuration

Set these server-side values without committing their values:

- `OAUTH_ISSUER=https://outliner.example.com` (the exact public origin)
- `OAUTH_ACCESS_TOKEN_SECRET` (a long, stable random secret shared by all
  Outliner server replicas)
- `OAUTH_FIREBASE_API_KEY`, `OAUTH_FIREBASE_AUTH_DOMAIN`, and
  `OAUTH_FIREBASE_APP_ID` (public Firebase web configuration for Google sign-in)
- Firebase Admin credentials and Firestore configuration already required by
  the on-premises server
- optionally `OAUTH_STATIC_CLIENTS`; dynamic registration is supported when a
  client does not have a pre-registered ID

Keep the default short access-token lifetime and persistent refresh-token
store. Restarting or scaling the server with an ephemeral signing secret will
invalidate active connections.

## Connect from ChatGPT

1. In ChatGPT's connector/MCP settings, add a remote MCP server with URL
   `https://outliner.example.com/mcp` and OAuth authentication.
2. Continue to Outliner's authorization page and choose **Sign in with
   Google**. Email/password authentication is intentionally unavailable.
3. Complete Google sign-in and approve the connection. ChatGPT discovers the
   OAuth endpoints from the public metadata and receives the `outliner.read`
   scope. Refresh is automatic and should not repeat Google sign-in while the
   refresh token remains valid.

The initial contract supports URL resolution, item/subtree/ancestor reads,
text search, and explicit Grid and Calendar metadata reads. It does **not**
support writes, item/Grid/Calendar mutation, a custom Apps SDK UI, or an
embedded Outliner chat interface.

## Reproducible production smoke test

Use two projects: grant the connecting Google user access to project A, but not
project B. Include Text, Layout, Grid, and Calendar nodes in A.

1. Connect the MCP URL and confirm the authorization page visibly offers only
   Google sign-in.
2. After sign-in, inspect the connector status: it must be connected and list
   only the seven read-only tools (`resolve_url`, `get_item`, `get_subtree`,
   `get_ancestors`, `search_items`, `get_grid`, and `get_calendar`).
3. Supply an Outliner URL for a page in A. Confirm `resolve_url` returns stable
   project/page IDs, then use those IDs to retrieve the page. Success means the
   response preserves Text, Layout, Grid, and Calendar `kind` values and keeps
   textless visual nodes.
4. Try direct item, subtree, search, URL, Grid, and Calendar reads against B.
   Every attempt must fail without returning its title, node IDs, counts, or
   other resource metadata.
5. Supply a malformed URL and malformed IDs; confirm they fail. Request subtree
   depth above 10, subtree size above 500, or search limit above 100; confirm
   each is rejected.
6. Reconnect after the access token lifetime has elapsed. Success means the
   connector refreshes without showing Google sign-in again.

Record the public origin, date, Firebase `uid` shown in server audit logs,
connector status, and pass/fail for each numbered step. Never record tokens or
secrets. A live ChatGPT UI session is a release smoke test; deterministic
server tests remain the protocol and authorization regression suite.
