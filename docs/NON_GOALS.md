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

## Task Management

### CHK-NON Complex Task Management

Outliner provides a simple Checklist widget (`CHK-0001`) that integrates with the Yjs document to sync across clients. It is intentionally simple and scoped to basic lists (shopping, packing, habit tracking). Full-fledged task management systems (e.g., Kanban boards, complex nested tasks, assignees, deadlines, or external calendar integrations) are non-goals for this project. If you need complex task functionality, we recommend using a dedicated task management application.

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
