# Calendar SQL Conventions

A calendar's query filters, but the client decides *what window is on
screen*. This mirrors `docs/schedule-sql-conventions.md`'s `job.occurrence`
convention: the client injects wall-clock context into the query's session as
a Postgres setting, and the query reads it with `current_setting(...)` rather
than computing "now" or "the visible window" itself.

## The visible range

Before running a calendar's query, the client computes the visible window —
a day, a week, a month, depending on the view — and injects it as two
settings, transaction-local (`set_config`'s third argument) and passed as
query parameters, never string-concatenated:

- `view.range_start` — inclusive start of the window
- `view.range_end` — exclusive end of the window

```sql
SELECT id, text AS title, 'item' AS source_kind, id AS source_id
FROM outline_items
WHERE start_at >= current_setting('view.range_start')::timestamptz
  AND start_at <  current_setting('view.range_end')::timestamptz
```

The end is exclusive — the same convention the calendar's time model uses for
an all-day entry (see `docs/crdt-sql-architecture.md` §6.1) — so an instant
exactly on a boundary lands in exactly one window, never both or neither.

## The overlap idiom

A plain `start_at BETWEEN range_start AND range_end` misses an entry that
started before the window and runs into it — a multi-day event, or anything
with `duration`. Filter on overlap instead:

```sql
WHERE start_at <  current_setting('view.range_end')::timestamptz
  AND start_at + duration > current_setting('view.range_start')::timestamptz
```

This is the idiom the calendar's role-assignment editor names when it warns
that a query references neither setting (see below).

## Filtering stays the query's job

Injection only sets the values; the `WHERE` clause remains the user's. A
query that never reads either setting still runs — it simply reads every
matching row instead of just what is on screen, which is fine for a small
table or a query that genuinely wants everything. The calendar's
role-assignment editor (`CalendarRoleEditor.svelte`) warns in that case,
naming the overlap idiom above, but never blocks execution. Detection is
textual (`calendarViewRange.ts`'s `queryReferencesViewRange`) and deliberately
shallow — it is not a SQL parser, so a query that builds the setting name
dynamically produces a spurious warning rather than a missed one.

## Scope

This injection is calendar-only. A table's own query
(`TableSyncAdapter.executeQuery`) has no view and never receives a range —
only `client/src/services/calendar/calendarQueryRunner.ts` injects it, in the
same transaction as the `SELECT` it runs.
