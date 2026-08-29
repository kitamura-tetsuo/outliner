# ChatGPT and Codex remote MCP operator guide

Outliner exposes a Streamable HTTP MCP server and an OAuth 2.0 authorization-code + PKCE bridge. A connection may be **read-only** (`outliner.read`) or **read/write** (`outliner.read outliner.write`). The connected identity is the Firebase `uid` from Google-backed Firebase Auth, and every tool uses the existing project authorization path. Enabling diagnostics never implicitly enables mutation.

## Public routes and environment

Publish one HTTPS origin, referred to below as `https://outliner.example.com`:

- MCP: `/mcp`
- authorization and token/refresh: `/oauth/authorize`, `/oauth/token`
- revocation and dynamic registration: `/oauth/revoke`, `/oauth/register`
- OAuth/OIDC discovery: `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`
- MCP protected-resource discovery: `/.well-known/oauth-protected-resource/mcp` (the un-suffixed path is an alias)

The proxy must preserve HTTPS host/protocol forwarding headers and route `/mcp`, `/oauth/*`, and `/.well-known/*` to the same process. Set `OAUTH_ISSUER` to the exact public origin, set a long stable `OAUTH_ACCESS_TOKEN_SECRET` shared by every replica, and provide the same `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` used by the web client. Firebase Admin credentials remain required. `OAUTH_STATIC_CLIENTS` is optional because PKCE dynamic registration is supported.

Do not commit secrets. Keep the short access-token lifetime and persistent refresh-token store. Refresh tokens retain their original scope and cannot upgrade a read-only grant. The consent page states whether access is read-only or read/write; request `outliner.write` only for a workflow that will mutate data. Google is the only supported sign-in provider.

## Tool catalog

All successful results are JSON in the MCP text result. All tools require `outliner.read`; only the final two also require `outliner.write`.

| Tool                       | Purpose and representative input                                                      | Result                                                                                   | Annotation                                                    |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `resolve_url`              | `{"url":"https://host/Project/-/tables/table-id"}`                                    | Authorized stable project/entity IDs and kind                                            | read-only                                                     |
| `get_item`                 | `{"projectId":"…","itemId":"…"}`                                                      | Semantic item and revision                                                               | read-only                                                     |
| `get_subtree`              | `{"projectId":"…","itemId":"…","depth":3,"limit":100}`                                | Ordered nodes and truncation metadata                                                    | read-only                                                     |
| `get_ancestors`            | project/item IDs                                                                      | Root-to-target ancestors                                                                 | read-only                                                     |
| `search_items`             | project ID, query, optional limit                                                     | Bounded text matches                                                                     | read-only                                                     |
| `get_grid`, `get_calendar` | project and view ID                                                                   | Lightweight configuration and revision                                                   | read-only                                                     |
| `get_table`                | `{"projectId":"…","tableId":"…","includeRecords":true,"recordLimit":25,"cursor":"…"}` | Schema, provenance, revision, count, stable-ID records, pagination                       | read-only                                                     |
| `trace_grid`               | project/grid IDs and optional `maxRows`                                               | Configuration, source, execution, editability, ordering, and render stages               | read-only                                                     |
| `validate_table_schema`    | project/table IDs and proposed `schemaSql`                                            | Compatibility warnings/errors and dependencies; never mutates                            | read-only                                                     |
| `validate_grid_query`      | project/grid IDs, proposed `query`, optional `resultLimit`                            | Bounded sample, columns, dependencies, ordering, editability, diagnostics; never mutates | read-only                                                     |
| `list_relations`           | project ID                                                                            | SQL-visible relations                                                                    | read-only                                                     |
| `get_relation_schema`      | project ID and relation                                                               | Columns and write capabilities                                                           | read-only                                                     |
| `query_sql`                | project ID, one SELECT, optional `maxRows`                                            | Bounded rows, columns, truncation                                                        | read-only                                                     |
| `write_relation`           | relation plus one structured INSERT/UPDATE/DELETE and safety fields                   | Apply/dry-run state and prior/new row revision                                           | **write; potentially destructive**                            |
| `set_view_query`           | Grid/Calendar ID, SELECT, and safety fields                                           | Apply/dry-run state and prior/new query revision                                         | **write; non-destructive configuration mutation**             |
| `update_grid_query`        | Grid ID, exact SELECT, expected revision, and retry fields                            | Before/after revisions, executable validation, and ordered sample rows                   | **write; non-destructive, idempotent configuration mutation** |

Clients that assumed exactly seven read-only tools must migrate to capability discovery: call `tools/list`, select by tool name, and honor each tool's `readOnlyHint` and `destructiveHint`. Do not reject additional tools or infer permissions from list length. A read-only token can discover the catalog but calls to write tools return `forbidden`.

## Limits and result interpretation

- Subtrees: depth at most 10 and at most 500 nodes. Search: at most 100 results.
- Table record pages: default 25, maximum 100. Continue with the opaque cursor; do not parse or synthesize it.
- SQL, Grid validation, and trace reads are bounded. Respect `truncated`, the effective limit, continuation metadata where present, and stage-level row counts; a returned page is not proof that no more data exists.
- Queries must be one read-only `SELECT`/`WITH` statement. Writes are structured operations, not arbitrary SQL.
- Query and schema text, write payloads/batches, IDs, URLs, and cursors are validated and size-limited. Split legitimate large work into bounded calls; never retry a `size_limit` unchanged.
- Ordering without SQL `ORDER BY` is incidental, not a stable guarantee. Reserved identifiers must be quoted, for example `ORDER BY "order"`.

## Safe diagnostic-to-repair workflow

1. Obtain a read-only grant first and resolve the canonical `/{project}/-/tables/{tableId}` URL.
2. Use `get_table` with bounded records, then `trace_grid`. Inspect every trace stage; an execution error or `incidental-source-order` means ordering has not been proven.
3. Use `validate_grid_query` with the corrected SELECT, such as `SELECT id, "order" FROM tasks ORDER BY "order"`. Validation is always non-mutating.
4. Reauthorize with `outliner.write` only after mutation is approved. Read the current target revision immediately before changing it.
5. For a Grid repair, call `update_grid_query` with `dryRun:true`, `expectedRevision`, and a unique stable `operationId`. It executes the exact query without rewriting it and rejects dependencies that cannot be safely materialized. Re-read the target to prove the dry run made no change.
6. Apply the identical operation with `dryRun:false`, the same expected revision, and the operation ID. Keep the operation ID for transport retries; changing it creates a distinct operation.
7. Re-read/trace and verify both the new revision and semantic outcome (for example row identities appear in the requested SQL order).

A concurrent update returns `stale_revision` and the current revision. Do not blindly retry: re-read, reconcile the proposal, dry-run it again, and use a new operation ID for the revised intent. Repeating an already-applied operation ID returns the recorded result with `replayed:true` and does not duplicate the mutation. Validation occurs before persistence; failed operations do not partially apply.

## Structured errors

Tool-level failures that reach Outliner's handler set `isError:true`; parse their JSON text rather than matching prose. It contains `code`, a safe `error`, and `requestId`, with bounded diagnostic fields where useful. The MCP SDK may reject an input that does not match the advertised JSON schema before the handler runs; that protocol-level response is plain `Input validation error` text rather than Outliner's structured JSON contract. Treat it as `invalid_argument`, correct the call from `tools/list`'s current input schema, and do not retry it unchanged.

| Code                                              | Operator action                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_argument`                                | Correct malformed IDs, canonical URL, cursor, SQL, or operation shape.                                                                         |
| `forbidden`                                       | Verify project membership and that a write call has an approved `outliner.write` grant. Do not disclose whether an inaccessible entity exists. |
| `not_found` / resolution-specific not-found codes | Re-resolve authorized URLs and IDs.                                                                                                            |
| `stale_revision`                                  | Re-read, reconcile, revalidate, and retry as a new intent.                                                                                     |
| `validation_failed`                               | Correct schema/query/write compatibility; no mutation was applied.                                                                             |
| `size_limit`                                      | Reduce the bounded read or split the write.                                                                                                    |
| `internal_failure`                                | Correlate the safe `requestId` with server logs; do not expose internal log details to the client.                                             |

## Audit and privacy

Every `write_relation` and `set_view_query` attempt that passes the MCP SDK's input-schema check—including dry runs, handler validation failures, scope failures, and replays—writes an `mcp_audit` JSONL record. Schema-invalid calls are rejected by the SDK before Outliner's audit wrapper is entered and therefore have no mutation audit record; retain transport/security logs if protocol-level rejection accounting is required. Audit entries contain the request ID, a one-way uid fingerprint, tool, project/entity identifiers, operation ID, dry-run/applied/replayed state, outcome, and prior/new revisions. They deliberately exclude bearer/refresh tokens, raw uid, authorization headers, query text, row values, and full payloads. Restrict and rotate the log like other security audit data. Use request IDs for correlation and never paste tokens into issue reports.

## Production connector smoke test

Prepare authorized project A and inaccessible project B. In A, create a Table with an integer column named `order`, records stored out of order, and a Grid whose unquoted query fails. Record only origin, date, uid fingerprint, operation ID, revisions, and pass/fail.

1. Verify OAuth/OIDC/protected-resource discovery, PKCE connection, Google-only consent, requested scope text, token refresh, and revocation.
2. With `outliner.read` only, list tools and verify annotations. Run every read/diagnostic tool against B and confirm an isolation failure with no title, IDs, counts, schema, or rows. Confirm both write tools return `forbidden`.
3. Against A, resolve its canonical Table URL, inspect bounded schema/records, and trace the broken Grid. Confirm malformed IDs/URLs, oversized limits, and non-SELECT SQL fail safely; confirm truncation metadata at a low limit.
4. Validate the corrected query containing `ORDER BY "order"`; confirm the saved query and revision did not change.
5. Reconnect with explicitly approved `outliner.write`. Dry-run `set_view_query` with the expected revision and operation ID, then re-read to prove no mutation.
6. Apply it, retry the same operation ID to confirm `replayed:true`, and trace the Grid to verify SQL ordering. Attempt the old revision to confirm `stale_revision` without rollback damage.
7. Exercise an invalid structured write and an oversized write; verify validation failure/no partial mutation. Review audit and error logs for identity/revision metadata and absence of tokens, query text, and sensitive row payloads.

The live ChatGPT/Codex connector run is a release smoke test; deterministic service, HTTP MCP, OAuth, integration, and production-protocol tests remain the regression suite.
