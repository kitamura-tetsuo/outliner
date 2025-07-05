import { openDB } from "idb";
import { beforeEach, expect, it } from "vitest";

async function clearDB() {
    const db = await openDB("outliner", 1, {
        upgrade(db) {
            db.createObjectStore("ops", { keyPath: "id", autoIncrement: true });
        },
    });
    await db.clear("ops");
    db.close();
}

beforeEach(async () => {
    await clearDB();
});

it("stores queued operations in indexedDB", async () => {
    const db = await openDB("outliner", 1);
    await db.add("ops", { url: "/api/test", body: { a: 1 } });
    const all = await db.getAll("ops");
    expect(all.length).toBe(1);
    expect(all[0].body.a).toBe(1);
});
