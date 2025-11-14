import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "./utils/TestHelpers";

registerCoverageHooks();

test.describe("Container Title Persistence", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
    });

    test("container remains visible in dropdown after page reload", async ({ page }) => {
        // Navigate to container creation page
        await page.goto("/containers");
        await page.waitForLoadState("networkidle");

        // Create a new container with a specific name
        const containerName = "Test Container for Persistence";
        await page.fill('input[placeholder="アウトライナー名を入力"]', containerName);
        await page.click('button:has-text("作成")');

        // Wait for success message and container creation
        await page.waitForSelector("text=新しいアウトライナーが作成されました", { timeout: 10000 });

        // Wait for automatic redirect to home page
        await page.waitForURL("/", { timeout: 5000 });

        // Verify container appears in dropdown with correct name
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasContainerName = optionTexts.some(text => text.includes(containerName));
        expect(hasContainerName).toBe(true);

        // Reload the page to test persistence
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Verify container still appears in dropdown after reload
        const dropdownAfterReload = page.locator("select.container-select");
        await expect(dropdownAfterReload).toBeVisible();

        const optionsAfterReload = dropdownAfterReload.locator("option");
        const optionTextsAfterReload = await optionsAfterReload.allTextContents();
        const hasContainerNameAfterReload = optionTextsAfterReload.some(text => text.includes(containerName));
        expect(hasContainerNameAfterReload).toBe(true);
    });

    test("shows container ID when title is unavailable", async ({ page }) => {
        // Navigate to home page
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Simulate a container with missing title by manipulating localStorage
        await page.evaluate(() => {
            // Add a container ID to userContainer but without cached title
            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: ["missing-title-container-123"],
                defaultContainerId: "missing-title-container-123",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Clear any existing title cache for this container
            const titleCache = JSON.parse(localStorage.getItem("outliner_container_titles") || "{}");
            delete titleCache["missing-title-container-123"];
            localStorage.setItem("outliner_container_titles", JSON.stringify(titleCache));

            // Trigger firestore store update
            window.dispatchEvent(
                new CustomEvent("firestore-uc-changed", {
                    detail: { userContainer: mockUserContainer },
                }),
            );
        });

        // Wait for the dropdown to update
        await page.waitForTimeout(1000);

        // Verify container appears with ID as fallback label
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasContainerId = optionTexts.some(text => text.includes("missing-title-container-123"));
        expect(hasContainerId).toBe(true);
    });

    test("uses cached title when available", async ({ page }) => {
        // Navigate to home page
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Set up a container with cached title
        await page.evaluate(() => {
            const containerId = "cached-title-container-456";
            const cachedTitle = "Cached Project Title";

            // Set cached title
            const titleCache = JSON.parse(localStorage.getItem("outliner_container_titles") || "{}");
            titleCache[containerId] = cachedTitle;
            localStorage.setItem("outliner_container_titles", JSON.stringify(titleCache));

            // Add container to userContainer
            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: [containerId],
                defaultContainerId: containerId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Trigger firestore store update
            window.dispatchEvent(
                new CustomEvent("firestore-uc-changed", {
                    detail: { userContainer: mockUserContainer },
                }),
            );
        });

        // Wait for the dropdown to update
        await page.waitForTimeout(1000);

        // Verify container appears with cached title
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasCachedTitle = optionTexts.some(text => text.includes("Cached Project Title"));
        expect(hasCachedTitle).toBe(true);
    });

    test("backwards compatibility with existing containers", async ({ page }) => {
        // Navigate to home page
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Simulate existing containers without cached titles
        await page.evaluate(() => {
            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: ["legacy-container-1", "legacy-container-2"],
                defaultContainerId: "legacy-container-1",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Clear title cache to simulate legacy state
            localStorage.removeItem("outliner_container_titles");

            // Trigger firestore store update
            window.dispatchEvent(
                new CustomEvent("firestore-uc-changed", {
                    detail: { userContainer: mockUserContainer },
                }),
            );
        });

        // Wait for the dropdown to update
        await page.waitForTimeout(1000);

        // Verify containers appear with IDs as fallback (backwards compatibility)
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasLegacyContainer1 = optionTexts.some(text => text.includes("legacy-container-1"));
        const hasLegacyContainer2 = optionTexts.some(text => text.includes("legacy-container-2"));

        expect(hasLegacyContainer1).toBe(true);
        expect(hasLegacyContainer2).toBe(true);
    });
});
