/** @feature HDV-0001
 *  Title   : Page snapshot diff viewer
 *  Source  : docs/client-features.yaml
 */
import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("snapshot diff viewer", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("display diff and revert", async ({ page }, testInfo) => {
    const { projectName, pageName } =
      await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
    await page.evaluate(
      ({ projectName, pageName }) => {
        window.__SNAPSHOT_SERVICE__.setCurrentContent(
          projectName,
          pageName,
          "second",
        );
        window.__SNAPSHOT_SERVICE__.addSnapshot(
          projectName,
          pageName,
          "first",
          "user",
        );
      },
      { projectName, pageName },
    );
    await page.goto(`/${projectName}/${pageName}/diff`);
    await page.waitForTimeout(1000);
    await page.getByText("Add Snapshot").click();
    await page.waitForSelector("li");
    const count = await page.evaluate(
      ({ projectName, pageName }) => {
        const { listSnapshots } = window.__SNAPSHOT_SERVICE__;
        return listSnapshots(projectName, pageName).length;
      },
      { projectName, pageName },
    );
    await expect(page.locator("li")).toHaveCount(count);
    await page.locator("li").first().click();
    await expect(page.locator("ins")).toBeVisible();
    await page.getByText("Revert").click();
    const current = await page.evaluate(
      ({ projectName, pageName }) => {
        const { getCurrentContent } = window.__SNAPSHOT_SERVICE__;
        return getCurrentContent(projectName, pageName);
      },
      { projectName, pageName },
    );
    expect(current).toBe("first");
  });
});
