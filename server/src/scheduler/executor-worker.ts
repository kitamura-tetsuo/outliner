import { PGlite } from "@electric-sql/pglite";
import { parentPort } from "worker_threads";
import * as Y from "yjs";
import { assertSingleCreateTable, introspectTable } from "../schema/schemaIntrospection.js";

// We keep a lazy singleton PGlite inside this worker
let pg: PGlite | null = null;

async function getPg() {
    if (!pg) {
        pg = new PGlite("memory://");
        await pg.waitReady;
    }
    return pg;
}

parentPort?.on("message", async (msg: any) => {
    if (msg.type === "EXECUTE_JOB") {
        const { jobId, rule, records, schemaText, occurrenceStr } = msg.payload;

        try {
            const db = await getPg();

            // Run in a single transaction
            const result = await db.transaction(async (tx) => {
                const schemaName = `throwaway_${jobId}`.replace(/[^a-zA-Z0-9_]/g, "");

                // 1. Create throwaway schema
                await tx.query(`CREATE SCHEMA "${schemaName}"`);
                await tx.query(`SET LOCAL search_path TO "${schemaName}"`);

                // 2. Load schema and data
                // Parse schema directly
                let parsedSchema;
                try {
                    const createSql = assertSingleCreateTable(schemaText);
                    await tx.query(createSql);
                    parsedSchema = await introspectTable(tx as any, schemaName, createSql);
                } catch (e) {
                    throw new Error(`Failed to create table from schema: ${e}`);
                }

                // Bulk load records
                if (records.length > 0) {
                    const columns = parsedSchema.columns.map((c: any) => c.name).filter((k: string) => k !== "id");
                    columns.unshift("id");

                    const valuePlaceholders = records.map((_: any, i: number) =>
                        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`
                    ).join(", ");

                    const values = records.flatMap((r: any) => columns.map(c => r[c] === undefined ? null : r[c]));

                    await tx.query(
                        `INSERT INTO "${parsedSchema.tableName}" (${
                            columns.map(c => `"${c}"`).join(", ")
                        }) VALUES ${valuePlaceholders}`,
                        values,
                    );
                }

                // 3. Set environment for rule
                await tx.query(`SELECT set_config('timezone', $1, true)`, [rule.timezone]);
                await tx.query(`SELECT set_config('job.occurrence', $1, true)`, [occurrenceStr]);

                // 4. Execute rule SQL
                let queryResult;
                try {
                    queryResult = await tx.query(rule.sql);
                } catch (e) {
                    throw new Error(`Rule SQL execution failed: ${e}`);
                }

                // 5. Cleanup schema
                await tx.query(`DROP SCHEMA "${schemaName}" CASCADE`);

                return {
                    rows: queryResult.rows,
                    parsedSchema,
                };
            });

            parentPort?.postMessage({
                type: "JOB_SUCCESS",
                jobId,
                payload: result,
            });
        } catch (error: any) {
            parentPort?.postMessage({
                type: "JOB_FAILURE",
                jobId,
                error: error.message || String(error),
            });
        }
    } else if (msg.type === "PING") {
        parentPort?.postMessage({ type: "PONG" });
    }
});
