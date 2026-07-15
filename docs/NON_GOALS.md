# Unimplemented Features

This document tracks features that are intentionally left out of the Outliner project. The table references the feature IDs defined in the YAML specifications.

## Security

### SEC-0002 Two-Factor Authentication (2FA)

Firebase Authentication is used for sign-in. Two-factor authentication is outside the scope of this project and will not be implemented.

## Notifications

### NOT-0001 External Notification Services

Outliner does not send notifications through Slack or any other external applications.

## Offline Editing

### OFF-NON Offline Editing Support

Offline editing will not be implemented. The Fluid Framework used for collaboration requires a network connection and does not support offline operations.

## Extensibility

### EXT-NON Plugin Architecture

Outliner does not provide a plugin system or extension API. Loading or executing user-defined plugins is outside the project's scope.

## Formatting

### CHK-NON Inline `[ ]`/`[x]` Checkbox Syntax for Outline Items

Typing `[ ]` or `[x]` at the start of an outline item does not turn it into an
interactive, clickable checkbox control, and parent items do not aggregate the
completion status of such children. `[ ]`/`[x]` are only ever rendered as
plain literal text (see `client/src/utils/ScrapboxFormatter.ts`, which
explicitly excludes them from internal-link parsing but does not render a
checkbox control for them). The public demo previously advertised this as a
feature on a "Checkboxes and Tasks" page; that page has been removed from
`server/src/demo-content.ts` since the behavior it demonstrated does not
exist (see issue #3421). Task/checklist functionality is available instead
through the standalone `Checklist.svelte` widget (`CHK-0001`,
`docs/client-features/chk-universal-checklist-7290ab91.yaml`), which is
unrelated to inline outline-item text syntax.

## Database Tables

### TBL-NON Migration from the legacy SQL table features

The consolidated Yjs + PGlite database table feature
(`docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml`) replaced
the former Table (`/table`), SQL Table (`/sql`, SQL Block), SQL Task Manager
and SQL Habit Tracker. Data stored in the legacy per-item structures
(`tableSchema` / `tableColumns` / `tableRows` on outliner items, and the
project-level `yDatabase` map) is NOT migrated to the new subdoc-based
structure; only newly created tables are supported. The old sql.js (SQLite)
engine was removed together with those features.
