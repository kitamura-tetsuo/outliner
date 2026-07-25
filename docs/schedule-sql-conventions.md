# Schedule SQL Conventions

When creating scheduled jobs for tables, the SQL statement must follow certain conventions to ensure safe, idempotent execution.

## The occurrence time

Each run of a schedule rule processes a specific "occurrence" of that schedule. The job executor exposes this occurrence time to your SQL statement via the `job.occurrence` setting.

**Always use `current_setting('job.occurrence')::timestamptz`** instead of `now()` or `current_timestamp` to represent the "current" time of the job.

Why?

- **Deterministic catch-up**: If the executor is offline for a while and misses runs, it will "catch up" by executing the job for each missed occurrence. Using `job.occurrence` ensures each run processes data relative to its scheduled time, not the actual execution time.
- **Hourly floor**: The occurrence time is rounded down to the nearest hour. This is a design constraint of the scheduler to prevent rapid micro-executions.

## Idempotency and the `id` column

Your SQL statement must generate a deterministic `id` column for any inserted records.

Why?

- If the executor crashes after writing to the database but before recording the job as complete, it will retry the job.
- A deterministic `id` ensures that retries don't create duplicate records. The `INSERT` statement should ideally use `ON CONFLICT (id) DO NOTHING` or `DO UPDATE` to handle this gracefully.

A common pattern is to combine the table name or job type with the `job.occurrence` to create a unique ID for that specific run:

```sql
INSERT INTO "my_table" (id, log_time, status)
VALUES (
    gen_random_uuid(), -- Or better, a hash of job.occurrence
    current_setting('job.occurrence')::timestamptz,
    'Run'
);
```

For aggregations, it's safer to use the occurrence time itself as part of the ID string if the column type allows it.

### Worked example: recurring tasks

The demo's recurring tasks (`Recurring Tasks` page, see `server/src/demo-content.ts`) follow this pattern. A stable `task_key` column identifies the recurring task — not its title, which the user may edit — and the id of a generated row combines that key with the occurrence date:

```sql
WITH inserted AS (
    INSERT INTO routine_tasks (id, kind, task_key, title, cadence, occurrence_date, done)
    SELECT
        t.task_key || '-' || to_char(current_setting('job.occurrence')::timestamptz, 'YYYY-MM-DD'),
        'occurrence', t.task_key, t.title, t.cadence,
        (current_setting('job.occurrence')::timestamptz)::date,
        false
    FROM routine_tasks t
    WHERE t.kind = 'template' AND t.cadence = 'daily'
    ON CONFLICT (id) DO NOTHING
    RETURNING *
)
SELECT id, kind, task_key, title, cadence,
       to_char(occurrence_date, 'YYYY-MM-DD') AS occurrence_date, done
FROM inserted
```

Two further conventions matter here:

- **Return JSON primitives**: returned rows are written back into the table's Yjs Data Storage and cast strictly against the schema, so a `DATE`/`TIMESTAMP` column must be rendered as text (`to_char`) rather than returned as a Postgres date, which would arrive as a `Date` object and fail the cast.
- **Never overwrite user state**: `ON CONFLICT (id) DO NOTHING` means a retried or caught-up occurrence returns no row, so a checkbox the user already ticked is never reset.

## Displaying only the latest occurrence

A table that accumulates one row per occurrence usually wants to show only the newest row per recurring item. Express that with a correlated `NOT EXISTS` rather than `DISTINCT ON` or `MAX(...)`: the grid is read-only for queries using DISTINCT, JOINs, GROUP BY or aggregates (see `client/src/services/yjstable/queryAnalysis.ts`), which would take the completion checkbox with it.

```sql
SELECT id, task_key, title, cadence, occurrence_date, done
FROM routine_tasks r
WHERE r.kind = 'occurrence'
  AND NOT EXISTS (
    SELECT 1 FROM routine_tasks later
    WHERE later.kind = 'occurrence'
      AND later.task_key = r.task_key
      AND later.occurrence_date > r.occurrence_date
  )
ORDER BY cadence, task_key
```

## Timezones

Schedule rules have an explicit timezone (e.g., `America/New_York`). This timezone is used by the executor to determine _when_ the job should run. The `job.occurrence` value provided to the SQL statement is an absolute UTC timestamp, so you can safely cast it to `timestamptz` without worrying about local server time.
