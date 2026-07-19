1. Add dependencies: Add `rrule`, `luxon`, and `@types/luxon` to `server/package.json` for schedule index derivation, compute and timezone conversions.
2. Create Schedule Indexer: Create `server/src/scheduler/schedule-indexer.ts` which exports:
   - `initializeScheduleIndex(db: BetterSqlite3.Database)` to create the `schedule_index` table if not exists.
   - `computeNextRunAt` to parse the `rrule`, `dtstart`, and `timezone` using `rrule` and `luxon`.
   - `handleStoreDocumentForSchedules` as the handler that will read the `schedules` Y.Map on document store and perform upserts and deletes into the sqlite db cache.
3. Integrate Indexer:
   - Modify `server/src/server.ts` to add the `onStoreDocument` hook into `new Hocuspocus({})`.
   - Modify `server/src/persistence.ts` to invoke `initializeScheduleIndex` on the `persistence.db`.
4. Create Tests: Create `server/tests/schedule-indexer.test.ts` to cover upsert/delete on rule changes, recompute triggers, DST boundary expansion, exhausted transition, and invalid-rule write-back.
5. Ensure formatting and verify tests.
