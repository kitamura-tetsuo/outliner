import type { FluidTableClient } from './fluidClient';
import type { SqlService } from './sqlService';

export function startSync(client: FluidTableClient, sql: SqlService) {
    if (!client.tables) return;
    client.tables.on('valueChanged', async () => {
        // naive approach: rebuild cache from Fluid data
        // iterate tables -> rows -> columns
        for (const [tableId, table] of Array.from(client.tables!.entries())) {
            const map = table as any;
            for (const [rowId, row] of Array.from(map.entries())) {
                for (const [column, value] of Array.from((row as any).entries())) {
                    await sql.exec(`INSERT OR REPLACE INTO ${tableId}(id, ${column}) VALUES ('${rowId}', '${value}')`);
                }
            }
        }
    });
}
