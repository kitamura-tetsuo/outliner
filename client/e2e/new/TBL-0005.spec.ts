/** @feature TBL-0005
 * queryStore advanced E2E test
 * Title   : queryStore complex execution and reactivity
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0005: queryStore complex execution", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return window.__JOIN_TABLE__ &&
                window.__JOIN_TABLE__.store &&
                window.__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return;

            try { await sql.query("SELECT 1 FROM test_users LIMIT 1"); } catch {
                await sql.exec(`
                    CREATE TABLE test_users(id TEXT PRIMARY KEY, name TEXT, age INTEGER);
                `);
                await sql.exec(`
                    INSERT INTO test_users VALUES
                    ('u1','Alice',25),
                    ('u2','Bob',30),
                    ('u3','Charlie',35);
                `);
            }

            try { await sql.query("SELECT 1 FROM test_orders LIMIT 1"); } catch {
                await sql.exec(`
                    CREATE TABLE test_orders(id TEXT PRIMARY KEY, user_id TEXT, amount REAL);
                `);
                await sql.exec(`
                    INSERT INTO test_orders VALUES
                    ('o1','u1',100.5),
                    ('o2','u1',200.75),
                    ('o3','u2',150.25);
                `);
            }
        });
    });

    test("complex query execution updates store", async ({ page }) => {
        const query = `
            SELECT u.name, COUNT(o.id) as order_count, SUM(o.amount) as total_amount
            FROM test_users u
            LEFT JOIN test_orders o ON u.id = o.user_id
            GROUP BY u.id, u.name
            ORDER BY u.name
        `;

        const result = await page.evaluate(async (q) => {
            const store = window.__JOIN_TABLE__.store;
            await store.run(q);
            return await new Promise(resolve => {
                const unsub = store.subscribe(value => { unsub(); resolve(value); });
            });
        }, query);

        expect(result.rows.length).toBe(3);
        expect(result.columnsMeta.length).toBe(3);
        const alice = result.rows.find((r: any) => r.name === 'Alice');
        expect(alice.order_count).toBe(2);
    });

    test("error handling resets store", async ({ page }) => {
        const outcome = await page.evaluate(async () => {
            const store = window.__JOIN_TABLE__.store;
            try {
                await store.run('SELECT * FORM test_users');
                return { success: true };
            } catch (e: any) {
                const val = await new Promise(resolve => {
                    const unsub = store.subscribe(v => { unsub(); resolve(v); });
                });
                return { success: false, msg: e.message, state: val };
            }
        });

        expect(outcome.success).toBe(false);
        expect(outcome.state.rows).toEqual([]);
        expect(outcome.state.columnsMeta).toEqual([]);
    });

    test("reactive updates fire on run", async ({ page }) => {
        await page.evaluate(() => {
            window.__updates__ = [];
            window.__unsub__ = window.__JOIN_TABLE__.store.subscribe(v => window.__updates__.push(v));
        });

        await page.evaluate(async () => {
            const store = window.__JOIN_TABLE__.store;
            await store.run('SELECT * FROM test_users');
        });

        await page.waitForFunction(() => window.__updates__ && window.__updates__.length > 0);
        const updates = await page.evaluate(() => window.__updates__);
        expect(updates.length).toBeGreaterThan(0);
        const last = updates[updates.length - 1];
        expect(last.rows.length).toBe(3);

        await page.evaluate(() => window.__unsub__ && window.__unsub__());
    });
});
