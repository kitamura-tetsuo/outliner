# Schedule Rules

Schedule rules allow you to automate data insertion, updates, or deletions within
your tables on a recurring basis.

## Conventions

- **Deterministic IDs**: When inserting records, use `gen_random_uuid()` for the
  `id` column to ensure compatibility with offline synchronization.
- **Idempotency with `job.occurrence`**: To avoid duplicate inserts if a job is
  retried or executed slightly off-schedule, you can reference
  `job.occurrence` (the specific timestamp or occurrence ID of the job run)
  within your statements.
- **Timezone Semantics**: The system uses the browser's default timezone when
  creating rules.
- **Catch-up Behavior**: If the executor is offline, it will run missed rules
  up to the hourly floor upon returning online.

### Example SQL Statement

```sql
INSERT INTO my_table (id, name, created_at)
VALUES (gen_random_uuid(), 'Daily Task', now());
```
