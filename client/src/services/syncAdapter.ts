import * as Y from "yjs";
import { executeQueryDebounced, executeWrite, type PGliteError, type QueryResult } from "./pgliteService";
import { type IntrospectedColumn, parseCreateTable } from "./schemaParser";

export const SYNC_ORIGIN = "pglite_sync_adapter";

export class TableSyncAdapter {
    private dataMap: Y.Map<Y.Map<string>>;
    private schemaText: Y.Text;
    private uiMap: Y.Map<unknown>;
    private tableId: string;
    private tableName: string = "unknown";
    private columns: IntrospectedColumn[] = [];

    public onQueryUpdate?: (result: QueryResult | null, error?: PGliteError) => void;
    public onSyncError?: (error: PGliteError) => void;

    private observerBound = false;

    constructor(tableId: string, dataMap: Y.Map<Y.Map<string>>, schemaText: Y.Text, uiMap: Y.Map<unknown>) {
        this.tableId = tableId;
        this.dataMap = dataMap;
        this.schemaText = schemaText;
        this.uiMap = uiMap;

        this.handleDataChange = this.handleDataChange.bind(this);
    }

    async init() {
        // 1. Parse schema and establish physical table in PGlite
        const sql = this.schemaText.toString();
        if (sql) {
            const parsed = await parseCreateTable(sql);
            if (parsed.isValid) {
                this.columns = parsed.columns;
                this.tableName = parsed.tableName;

                // Ensure table exists in public schema
                await executeWrite(`DROP TABLE IF EXISTS ${this.tableName} CASCADE;`);
                await executeWrite(sql);

                // Seed data from Yjs into PGlite
                await this.seedData();
            }
        }

        // 2. Bind Observers
        if (!this.observerBound) {
            this.dataMap.observeDeep(this.handleDataChange);
            this.observerBound = true;
        }

        // 3. Initial Query execution
        this.executeQuery();
    }

    destroy() {
        if (this.observerBound) {
            this.dataMap.unobserveDeep(this.handleDataChange);
            this.observerBound = false;
        }
    }

    private async seedData() {
        if (this.columns.length === 0) return;

        const promises: Promise<void>[] = [];
        this.dataMap.forEach((rowMap, recordId) => {
            promises.push(this.insertRecord(recordId, rowMap as unknown as Y.Map<unknown>));
        });

        await Promise.all(promises);
    }

    private handleDataChange(events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) {
        if (transaction.origin === SYNC_ORIGIN) return; // Suppress echo

        let needsRequery = false;

        for (const event of events) {
            if (event.target === this.dataMap) {
                // Row added or deleted
                event.keys.forEach((change, key) => {
                    if (change.action === "add") {
                        const rowMap = this.dataMap.get(key);
                        if (rowMap) {
                            this.insertRecord(key, rowMap as unknown as Y.Map<unknown>);
                            needsRequery = true;
                        }
                    } else if (change.action === "delete") {
                        this.deleteRecord(key);
                        needsRequery = true;
                    }
                });
            } else if (event.target.parent === this.dataMap) {
                // Column updated within a row
                const recordId = this.getRecordIdForMap(event.target as Y.Map<string>);
                if (recordId) {
                    event.keys.forEach((change, colName) => {
                        if (change.action === "add" || change.action === "update") {
                            const val = (event.target as Y.Map<string>).get(colName);
                            this.updateRecordColumn(recordId, colName, val);
                            needsRequery = true;
                        }
                    });
                }
            }
        }

        if (needsRequery) {
            this.executeQuery();
        }
    }

    private getRecordIdForMap(rowMap: Y.Map<string>): string | undefined {
        for (const [key, value] of this.dataMap.entries()) {
            if (value === rowMap) return key;
        }
        return undefined;
    }

    private async insertRecord(recordId: string, rowMap: Y.Map<unknown>) {
        const cols = [];
        const vals = [];
        const placeholders = [];
        let i = 1;

        cols.push("id"); // Assume 'id' is required/UUID
        vals.push(recordId);
        placeholders.push(`$${i++}`);

        for (const colMeta of this.columns) {
            if (colMeta.name === "id") continue;
            const val = rowMap.get(colMeta.name);
            if (val !== undefined) {
                cols.push(colMeta.name);
                vals.push(val);
                placeholders.push(`$${i++}`);
            }
        }

        const q = `INSERT INTO ${this.tableName} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`;
        try {
            await executeWrite(q, vals);
        } catch (err) {
            const e = err as { message?: string; code?: string; };
            if (this.onSyncError) {
                this.onSyncError({ recordId, message: e.message || String(err), code: e.code });
            }
        }
    }

    private async updateRecordColumn(recordId: string, colName: string, val: unknown) {
        const q = `UPDATE ${this.tableName} SET ${colName} = $1 WHERE id = $2`;
        try {
            await executeWrite(q, [val, recordId]);
        } catch (err) {
            const e = err as { message?: string; code?: string; };
            if (this.onSyncError) {
                this.onSyncError({ recordId, column: colName, message: e.message || String(err), code: e.code });
            }
        }
    }

    private async deleteRecord(recordId: string) {
        const q = `DELETE FROM ${this.tableName} WHERE id = $1`;
        try {
            await executeWrite(q, [recordId]);
        } catch (_err) {
            // Ignore delete errors generally
        }
    }

    public executeQuery() {
        const query = this.uiMap.get("query") as string;
        if (!query || typeof query !== "string") {
            if (this.onQueryUpdate) this.onQueryUpdate(null);
            return;
        }

        executeQueryDebounced(`table_${this.tableId}`, query, [], (res, err) => {
            if (this.onQueryUpdate) {
                this.onQueryUpdate(res, err);
            }
        });
    }
}
