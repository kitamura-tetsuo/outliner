import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("unknown Kanban identity never substitutes or creates a board", async ({ page }, testInfo) => {
    const seeded = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Kanban route boundary"]);
    const project = encodeURIComponent(seeded.projectName);
    await page.goto(`/${project}/-/kanbans/unknown-board`);
    await expect(page.getByTestId("kanban-not-found")).toBeVisible();
    await expect(page.getByTestId("kanban-board")).toHaveCount(0);
});
