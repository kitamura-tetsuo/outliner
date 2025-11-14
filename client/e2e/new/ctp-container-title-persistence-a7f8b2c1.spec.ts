import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

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
        // Navigate to home page and ensure Firestore store is available
        await page.goto("/");
        await page.waitForFunction(() => {
            try {
                return typeof (window as any).__FIRESTORE_STORE__ !== "undefined";
            } catch {
                return false;
            }
        }, { timeout: 10000 });

        // Simulate a container with missing title by manipulating localStorage and store state
        await page.evaluate(() => {
            const containerId = "missing-title-container-123";
            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (!fs || typeof fs.setUserContainer !== "function") {
                throw new Error("__FIRESTORE_STORE__.setUserContainer is not available");
            }

            const now = new Date();
            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: [containerId],
                defaultContainerId: containerId,
                createdAt: now,
                updatedAt: now,
            };

            // Clear any existing title cache for this container
            const titleCache = JSON.parse(window.localStorage.getItem("outliner_container_titles") || "{}");
            delete titleCache[containerId];
            window.localStorage.setItem("outliner_container_titles", JSON.stringify(titleCache));

            fs.setUserContainer(mockUserContainer);
        });

        // Wait for the dropdown to update
        await page.waitForFunction(
            (id) => {
                const select = document.querySelector("select.container-select");
                if (!select) return false;
                return Array.from(select.querySelectorAll("option")).some(option =>
                    (option as HTMLOptionElement).textContent?.includes(id)
                );
            },
            "missing-title-container-123",
            { timeout: 10000 },
        );

        // Verify container appears with ID as fallback label
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasContainerId = optionTexts.some(text => text.includes("missing-title-container-123"));
        expect(hasContainerId).toBe(true);
    });

    test("uses cached title when available", async ({ page }) => {
        // Navigate to home page and ensure Firestore store is available
        await page.goto("/");
        await page.waitForFunction(() => {
            try {
                return typeof (window as any).__FIRESTORE_STORE__ !== "undefined";
            } catch {
                return false;
            }
        }, { timeout: 10000 });

        // Set up a container with cached title
        await page.evaluate(() => {
            const containerId = "cached-title-container-456";
            const cachedTitle = "Cached Project Title";

            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (!fs || typeof fs.setUserContainer !== "function") {
                throw new Error("__FIRESTORE_STORE__.setUserContainer is not available");
            }

            // Set cached title
            const titleCache = JSON.parse(window.localStorage.getItem("outliner_container_titles") || "{}");
            titleCache[containerId] = cachedTitle;
            window.localStorage.setItem("outliner_container_titles", JSON.stringify(titleCache));

            // Add container to userContainer via store API
            const now = new Date();
            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: [containerId],
                defaultContainerId: containerId,
                createdAt: now,
                updatedAt: now,
            };

            fs.setUserContainer(mockUserContainer);
        });

        // Wait for the dropdown to update
        await page.waitForFunction(
            (label) => {
                const select = document.querySelector("select.container-select");
                if (!select) return false;
                return Array.from(select.querySelectorAll("option")).some(option =>
                    (option as HTMLOptionElement).textContent?.includes(label)
                );
            },
            "Cached Project Title",
            { timeout: 10000 },
        );

        // Verify container appears with cached title
        const dropdown = page.locator("select.container-select");
        await expect(dropdown).toBeVisible();

        const options = dropdown.locator("option");
        const optionTexts = await options.allTextContents();
        const hasCachedTitle = optionTexts.some(text => text.includes("Cached Project Title"));
        expect(hasCachedTitle).toBe(true);
    });

    test("backwards compatibility with existing containers", async ({ page }) => {
        // Navigate to home page and ensure Firestore store is available
        await page.goto("/");
        await page.waitForFunction(() => {
            try {
                return typeof (window as any).__FIRESTORE_STORE__ !== "undefined";
            } catch {
                return false;
            }
        }, { timeout: 10000 });

        // Simulate existing containers without cached titles
        await page.evaluate(() => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (!fs || typeof fs.setUserContainer !== "function") {
                throw new Error("__FIRESTORE_STORE__.setUserContainer is not available");
            }

            const mockUserContainer = {
                userId: "test-user-id",
                accessibleContainerIds: ["legacy-container-1", "legacy-container-2"],
                defaultContainerId: "legacy-container-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Clear title cache to simulate legacy state
            window.localStorage.removeItem("outliner_container_titles");

            fs.setUserContainer(mockUserContainer);
        });

        // Wait for the dropdown to update with both legacy containers
        await page.waitForFunction(
            (ids) => {
                const select = document.querySelector("select.container-select");
                if (!select) return false;
                const texts = Array.from(select.querySelectorAll("option")).map(option =>
                    (option as HTMLOptionElement).textContent || ""
                );
                return (ids as string[]).every(id => texts.some(text => text.includes(id)));
            },
            ["legacy-container-1", "legacy-container-2"],
            { timeout: 10000 },
        );

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
