/** @feature FTR-4b7e2a91 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "receives a server-produced saved-SQL rejection through Yjs on both management surfaces",
    async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Schedule diagnostics"]);
        const ruleId = "e2e-invalid-saved-sql";
        await page.evaluate(({ ruleId }) => {
            // eslint-disable-next-line no-restricted-globals
            const project = (window as any).__YJS_STORE__?.yjsClient?.getProject();
            if (!project) throw new Error("Current Yjs project is unavailable");
            const schedules = project.ydoc.getMap("schedules");
            const YMap = schedules.constructor as new() => any;
            const rule = new YMap();
            rule.set("name", "Server rejected SQL");
            rule.set("targetTableId", "missing-target-is-not-executed");
            rule.set("sql", "SELECT 1");
            rule.set("rrule", "RRULE:FREQ=DAILY");
            rule.set("dtstart", "2026-01-01T00:00:00");
            rule.set("timezone", "UTC");
            rule.set("enabled", false);
            rule.set("catchUp", false);
            schedules.set(ruleId, rule);
        }, { ruleId });

        await page.goto(`/${encodeURIComponent(projectName)}/-/schedules`);
        const managerDiagnostic = page.locator(`[data-rule-id="${ruleId}"]`).getByTestId(
            "schedule-rule-sql-validation-error",
        );
        await expect(managerDiagnostic).toContainText("Query must be an INSERT statement", { timeout: 60000 });

        await page.getByTestId("schedule-rule-name").filter({ hasText: "Server rejected SQL" }).click();
        await expect(page.getByTestId("schedule-detail-sql-validation-error")).toContainText(
            "Query must be an INSERT statement",
            { timeout: 30000 },
        );
    },
);
