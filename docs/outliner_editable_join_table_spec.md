# Specification: Editable JOIN Table with Fluid Framework & SQLite WASM

## 1. Purpose

Implement a Notion‑like table component in **Svelte 5** that:

- Displays results of **arbitrary SQL queries** (including JOINs) executed against a **read‑only SQLite WASM** cache.
- Allows inline editing of cells **only when the originating table/column can be unambiguously identified**.
- Propagates edits **exclusively through Fluid Framework** (master data), after which normal sync updates the SQLite cache and UI.
- Provides chart components driven by SQL query outputs.

## 2. Tech Stack & Key Libraries

| Concern              | Choice                                | Notes                                                                                                                    |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| UI Framework         | **Svelte 5**                          | Runes syntax.                                                                                                            |
| Table Component      | **SVAR Svelte DataGrid**              | Inline editing, add/delete, sorting, filtering.                                                                          |
| Chart Library        | **Apache ECharts**                    | Rich interactive charts, updated via `setOption`.                                                                        |
| SQL Engine (Browser) | **SQLite WASM (sql.js custom build)** | Built with `-DSQLITE_ENABLE_COLUMN_METADATA` & `-DSQLITE_ENABLE_BYTECODE_VTAB`. Table names = UUIDs to avoid collisions. |
| Data Sync            | **Fluid Framework**                   | SharedTree / SharedMap per logical table.                                                                                |
| Query Builder        | **Kysely** (optional)                 | Typed wrapper around SQL WASM.                                                                                           |

## 3. Data Model & Conventions

1. **Physical table names** are UUIDs (e.g. `tbl_8fa7e7d1`).\
      → Eliminates name collisions when multiple DBs are `ATTACH`‑ed.
2. **Each table** must have a single‑column **primary key**, `id` (UUID text).
3. **Fluid** stores canonical rows. Example schema:
   ```ts
   interface Row<T> { id: string } & T;
   interface TableDDS<T> extends SharedMap { /* rows keyed by id */ }
   ```
4. **SQLite cache** is regenerated/updated from Fluid ops; UI NEVER writes to SQLite directly.
5. **SELECT wrapper** auto‑injects PKs with unique aliases per source alias, e.g.:
   ```sql
   SELECT o.id AS o_pk, c.id AS c_pk, o.amount, c.name
   FROM orders o JOIN customers c ON …
   ```

## 4. Column Metadata Extraction

- After `prepare()` each statement, loop columns:
  ```js
  {
    table: sqlite3_column_table_name(stmt, i),
    column: sqlite3_column_origin_name(stmt, i),
    db:    sqlite3_column_database_name(stmt, i)
  }
  ```
- If **any of the above is null**, mark column **read‑only**.
- Row object also carries PK aliases (`o_pk`, `c_pk`, …) for edit routing.

### Self‑join / alias handling

- Self‑joins are distinguished by **PK alias**. Each alias maps to `(tableUuid, pkValue)`.

## 5. UI Behaviour

| Scenario                                          | Behaviour                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Column has full metadata & matching PK alias      | Editable cell (double‑click or Enter).                            |
| Computed / ambiguous column                       | Rendered read‑only (gray text + lock icon).                       |
| Editing “one‑side” value duplicated in result set | On edit commit, highlight all affected duplicate cells for 1 sec. |

## 6. Edit Flow

```
User edits cell → DataGrid onEdit →
 1️⃣ lookup {tableUuid, pk, column}
 2️⃣ FluidService.updateCell(tableUuid, pk, column, newValue)
     → emits Fluid op
 3️⃣ Sync layer applies op to in‑memory SQLite →
 4️⃣ SELECT is re‑run, Svelte store updates →
 5️⃣ Grid & charts reactively refresh
```

*Pessimistic concurrency* is unnecessary; Fluid handles merge (last‑writer‑wins).

## 7. Chart Integration

1. UI has a **Query Editor** (SQL textarea) & **Chart Designer** (pick bar/line/pie).
2. On run:
   1. Execute SQL via same wrapper.
   2. Transform result → ECharts `option`.
   3. Call `chart.setOption(option, { notMerge: true })`.
3. Re‑run automatically when relevant Fluid ops hit SQLite.

## 8. Implementation Order (Coding Agent Guide)

1. **Scaffold** Svelte 5 + Vite workspace. Add SVAR DataGrid & ECharts.
2. **Integrate Fluid Framework**
   - Create `fluidClient.ts` (loader, container, TableDDS helpers).
3. **Build SQLite WASM layer**
   - Custom sql.js build with metadata flags.
   - Wrap with `SqlService` (execute, extract metadata).
4. **Implement Query Store**
   - Takes raw SQL, returns `{ rows, columnsMeta }` store.
5. **Implement EditMapper**
   - Given `columnsMeta` & row, translate onEdit → Fluid update.
6. **Render DataGrid**
   - Bind rows; apply read‑only formatter using `columnsMeta`.
   - Wire `onCellEdited` → EditMapper.
7. **Fluid→SQLite sync worker**
   - Listen to Fluid ops, apply to SQLite.
8. **Charts**
   - Build Chart component that consumes Query Store.
9. **UX Polish**
   - Duplicate‑cell flash, tooltips for read‑only cells.

## 9. Test Plan & Order

1. **Unit – SqlService**
   - Verify metadata extraction for simple & joined queries.
2. **Unit – EditMapper**
   - Given metadata & row, assert correct `(table, pk, col)` mapping.
3. **Integration – Fluid↔SQLite Sync**
   - Simulate Fluid ops, assert SQLite mirror matches.
4. **Integration – Grid Edit**
   - Use Playwright: edit editable cell → expect Fluid op + grid refresh.
   - Attempt edit on read‑only column → expect disabled interaction.
5. **E2E – Chart Auto‑Refresh**
   - Edit data, verify chart updates within 500 ms.
6. **Concurrency / Collision**
   - Two simulated clients editing different cells; verify merge + UI update.
7. **Performance (2000 rows)**
   - Measure grid render < 100 ms, chart update < 150 ms.

## 10. Deliverables

- `/src/services/`
  - `fluidClient.ts`, `sqlService.ts`, `syncWorker.ts`, `editMapper.ts`
- `/src/components/`
  - `EditableQueryGrid.svelte`, `ChartPanel.svelte`, `QueryEditor.svelte`
- `/tests/` Playwright & Vitest suites.
- Documentation README covering build, run, and extension guidelines.

---

**Ready for Coding Agent** – this document contains all functional/technical requirements plus a clear implementation & test sequence. Feel free to iterate, but avoid deviating from the Fluid‑first write path and metadata‑driven editability model.

