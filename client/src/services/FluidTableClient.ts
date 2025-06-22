export class FluidTableClient {
    data: Record<string, any[]> = {};
    set(table: string, rows: any[]) {
        this.data[table] = rows;
    }
    get(table: string) {
        return this.data[table] || [];
    }
}
