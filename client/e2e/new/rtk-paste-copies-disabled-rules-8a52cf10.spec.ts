/** @feature FTR-6b2f10c7 */
import { expect, type Page, test } from "@playwright/test";
import {
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// The shape of the demo's routine rule: a data-modifying CTE writing into the
// Grid it targets (docs/schedule-sql-conventions.md).
const RULE_SQL = "WITH inserted AS (\n"
    + "    INSERT INTO orders (id, title)\n"
    + "    SELECT 'daily', 'Daily order'\n"
    + "    ON CONFLICT (id) DO NOTHING\n"
    + "    RETURNING *\n"
    + ")\nSELECT id, title FROM inserted";

async function addScheduleRule(page: Page, targetTableId: string): Promise<void> {
    await page.evaluate(({ tableId, sql }) => {
        // eslint-disable-next-line no-restricted-globals
        const project = (window as any).__YJS_STORE__?.yjsClient?.getProject();
        if (!project) throw new Error("Current Yjs project is unavailable");
        const schedules = project.ydoc.getMap("schedules");
        // Yjs is not exposed as a global; reach Y.Map through an instance the
        // document already holds rather than adding a hook to production code.
        const YMap = schedules.constructor as new() => any;
        const rule = new YMap();
        rule.set("name", "Daily orders");
        rule.set("targetTableId", tableId);
        rule.set("sql", sql);
        rule.set("rrule", "RRULE:FREQ=DAILY");
        rule.set("dtstart", "2026-01-01T00:00:00");
        rule.set("timezone", "UTC");
        rule.set("enabled", true);
        rule.set("catchUp", true);
        schedules.set("e2e-daily-orders", rule);
    }, { tableId: targetTableId, sql: RULE_SQL });
}

async function readScheduleRules(page: Page): Promise<Array<Record<string, unknown>>> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-globals
        const project = (window as any).__YJS_STORE__?.yjsClient?.getProject();
        if (!project) throw new Error("Current Yjs project is unavailable");
        const rules: Array<Record<string, unknown>> = [];
        project.ydoc.getMap("schedules").forEach((rule: any) => rules.push(rule.toJSON()));
        return rules;
    });
}

// Spec §9.2: the rule that generates a Grid's rows comes across with it, and
// arrives switched off. Without it the destination held a snapshot that was
// correct on the day it was pasted and frozen the day after.
test.describe("pasting a Grid whose rows a schedule rule generates", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("copies the rule disabled, retargeted and with its relation rewritten", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Orders", "orders");
        const sourceTableId = (await readGridProjectState(page)).tables[0].id;
        await addScheduleRule(page, sourceTableId);
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");
        // Occupy the `orders` relation so the clone has to be renamed, which is
        // the case a copied rule's SQL has to follow.
        await createBlankGrid(page, "Existing orders", "orders");
        const warmupTableId = (await readGridProjectState(page)).tables[0].id;

        await pasteAtAnchor(page, 2);

        const state = await readGridProjectState(page);
        const clone = state.tables.find(table => table.id !== warmupTableId)!;
        expect(clone.sqlName).toBe("orders_2");

        const rules = await readScheduleRules(page);
        expect(rules).toHaveLength(1);
        // Disabled: a paste never starts writing to a project on a timer
        // nobody asked for.
        expect(rules[0].enabled).toBe(false);
        expect(rules[0].targetTableId).toBe(clone.id);
        expect(rules[0].sql).toContain("INSERT INTO orders_2 (id, title)");
        // What decides when it runs is preserved, so enabling it replays the
        // same history the source has.
        expect(rules[0].rrule).toBe("RRULE:FREQ=DAILY");
        expect(rules[0].dtstart).toBe("2026-01-01T00:00:00");
        expect(rules[0].timezone).toBe("UTC");

        await expect(page.getByTestId("grid-paste-status")).toContainText("copied switched off");
    });
});
