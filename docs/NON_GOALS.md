# Unimplemented Features

This document tracks features that are intentionally left out of the Outliner project. The table references the feature IDs defined in the YAML specifications.

## Security

### SEC-0002 Two-Factor Authentication (2FA)

Firebase Authentication is used for sign-in. Two-factor authentication is outside the scope of this project and will not be implemented.

## Notifications

### NOT-0001 External Notification Services

Outliner does not send notifications through Slack or any other external applications.

## Offline Editing

### OFF-NON Offline HTTP API Requests

Offline outline editing **is** supported via `y-indexeddb` persistence and CRDT merge on reconnect (see `client/src/lib/yjs/connection.ts`). Offline edits are retained indefinitely in IndexedDB until the browser's data is manually cleared; there is currently no automatic eviction policy.

However, non-Yjs offline HTTP API requests (e.g., project saves, schedules) are not queued by the service worker. Any write attempted against these REST endpoints while offline will fail loudly rather than being dropped silently.

## Extensibility

### EXT-NON Plugin Architecture

Outliner does not provide a plugin system or extension API. Loading or executing user-defined plugins is outside the project's scope.

## Tasks and Checklists

### CHK-NON Task Management Features

Outliner relies on the collaborative Checklist widget (`CHK-0001`) and inline checkboxes (`CHK-0002`) for task management needs. There are no plans to implement a separate, dedicated task management feature.

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

## Page Management

### PAG-NON Page Deletion

Outliner does not support deleting individual pages. Pages are append-only and permanent once created. This is a deliberate design choice because deleting a page is destructive and interacts deeply with backlinks, the graph view, and search indexing. Instead of deleting pages, users can rename them to indicate they are no longer in use (e.g., prefixing with `[Archived]`), or simply remove all content from the page. Whole-project deletion is supported (`docs/client-features/del-project-deletion-page-c8da7a47.yaml`).
