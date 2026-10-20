import type { PGlite } from "@electric-sql/pglite";
import { loadModule, parseSync } from "libpg-query";

await loadModule();

/** Native bindings survive optimizer pruning; this probe never writes Project state. */
export async function boundGridRelations(db: PGlite, query: string, columnCount: number, admitted: readonly string[]) {
    const name = `mcp_grid_probe_${crypto.randomUUID().replace(/-/g, "")}`;
    const aliases = Array.from({ length: columnCount }, (_, i) => `"column_${i}"`).join(",");
    try {
        await db.exec(`CREATE TEMP VIEW "${name}" ${columnCount ? `(${aliases})` : ""} AS ${query}`);
        const result = await db.query<{ schema_name: string; relation_name: string; }>(
            `
            SELECT DISTINCT source_ns.nspname AS schema_name, source.relname AS relation_name
            FROM pg_catalog.pg_rewrite AS rewrite
            JOIN pg_catalog.pg_depend AS dependency
              ON dependency.classid = 'pg_catalog.pg_rewrite'::regclass AND dependency.objid = rewrite.oid
             AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
            JOIN pg_catalog.pg_class AS source ON source.oid = dependency.refobjid
            JOIN pg_catalog.pg_namespace AS source_ns ON source_ns.oid = source.relnamespace
            JOIN pg_catalog.pg_class AS probe ON probe.oid = rewrite.ev_class
            WHERE probe.relnamespace = pg_my_temp_schema() AND probe.relname = $1
              AND source.oid <> probe.oid AND dependency.deptype = 'n'`,
            [name],
        );
        // Pinned built-ins can have no pg_depend entry. Only certify the
        // admitted public subset, with every AST relation reference accounted for.
        const references: { schema?: string; name: string; }[] = [];
        const walk = (value: unknown) => {
            if (!value || typeof value !== "object") return;
            const node = value as Record<string, unknown>;
            if (node.RangeVar) {
                const ref = node.RangeVar as { schemaname?: string; relname: string; };
                references.push({ schema: ref.schemaname, name: ref.relname });
            }
            for (const child of Object.values(node)) walk(child);
        };
        walk(parseSync(query));
        const relations = result.rows.filter(row =>
            row.schema_name === "public" && admitted.includes(row.relation_name)
        )
            .map(row => row.relation_name).sort();
        const complete = result.rows.every(row => row.schema_name === "public" && admitted.includes(row.relation_name))
            && references.every(ref =>
                (!ref.schema || ref.schema === "public") && admitted.includes(ref.name) && relations.includes(ref.name)
            );
        return { status: complete ? "proven" as const : "unknown" as const, relations };
    } finally {
        await db.exec(`DROP VIEW IF EXISTS pg_temp."${name}"`);
    }
}
