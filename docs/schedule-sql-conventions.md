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

## Timezones

Schedule rules have an explicit timezone (e.g., `America/New_York`). This timezone is used by the executor to determine _when_ the job should run. The `job.occurrence` value provided to the SQL statement is an absolute UTC timestamp, so you can safely cast it to `timestamptz` without worrying about local server time.
