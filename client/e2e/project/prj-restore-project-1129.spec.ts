import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Restoration", () => {
    test("should be able to restore a project from the trash", async ({ page }) => {
        // Create project and get its name
        const { projectName } = await TestHelpers.prepareTestEnvironment(page);

        // Get the container ID and store the project title in metaDoc before navigating away
        const containerId = await page.evaluate((projectName) => {
            const yjsStore = (window as any).__YJS_STORE__;
            const containerId = yjsStore?.yjsClient?.containerId || null;

            // Ensure the project title is stored in metaDoc
            if (containerId) {
                try {
                    const setContainerTitle = (window as any).__SET_CONTAINER_TITLE_IN_META_DOC__;
                    if (setContainerTitle) {
                        setContainerTitle(containerId, projectName);
                    }
                } catch {}
            }

            return containerId;
        }, projectName);

        await page.goto("/projects/delete");

        // After navigation, set up the container in firestoreStore with proper project name
        await page.evaluate(({ containerId, projectName }) => {
            if (containerId) {
                // First, try to set the container title in metaDoc
                try {
                    const setContainerTitle = (window as any).__SET_CONTAINER_TITLE_IN_META_DOC__;
                    if (setContainerTitle) {
                        setContainerTitle(containerId, projectName);
                    }
                } catch {}

                const firestoreStore = (window as any).__FIRESTORE_STORE__;
                if (firestoreStore) {
                    const currentData = firestoreStore.userContainer || {
                        userId: "test-user-id",
                        accessibleContainerIds: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                    const ids = currentData.accessibleContainerIds || [];
                    if (!ids.includes(containerId)) {
                        ids.push(containerId);
                    }
                    firestoreStore.setUserContainer({
                        ...currentData,
                        defaultContainerId: containerId,
                        accessibleContainerIds: ids,
                        updatedAt: new Date(),
                    });
                }

                // Also update the container store directly
                const containerStore = (window as any).__CONTAINER_STORE__;
                if (containerStore && typeof containerStore.syncFromFirestore === "function") {
                    containerStore.syncFromFirestore();
                }
            }
        }, { containerId, projectName });

        // Wait for the projects list to populate in the DOM
        await page.waitForFunction(() => {
            const table = document.querySelector("table");
            return table && table.querySelectorAll("tbody tr").length > 0;
        }, { timeout: 10000 });

        // Wait for the Delete button to be visible
        await expect(page.locator("button:has-text('Delete')").first()).toBeVisible({ timeout: 10000 });

        // Get the actual project title from the dialog prompt
        await page.click("button:has-text('Delete')");

        // Wait for the delete dialog to appear
        await expect(page.getByTestId("delete-project-dialog")).toBeVisible();
        await expect(page.getByTestId("delete-project-dialog").locator("h2")).toHaveText("Delete Project");

        // Get the title from the dialog's strong element (it shows the exact title expected)
        const dialogTitle = await page.getByTestId("delete-project-dialog").locator("strong").textContent();

        await page.getByTestId("delete-project-dialog").locator("input[type='text']").fill(dialogTitle || projectName);
        await page.getByTestId("delete-project-dialog").locator("button:has-text('Delete')").click();

        // Wait for the dialog to close and the delete operation to complete
        await page.waitForTimeout(1000);

        // Go to trash and restore it
        await page.goto("/projects/trash");
        await expect(page.locator("button:has-text('Restore')").first()).toBeVisible({ timeout: 10000 });
        await page.click("button:has-text('Restore')");

        // Wait for the restore operation to complete
        await page.waitForTimeout(1000);

        // Verify the project is back in the main list (on the delete page which lists active projects)
        await page.goto("/projects/delete");

        // Re-populate the firestoreStore after navigation
        await page.evaluate(({ containerId, projectName }) => {
            if (containerId) {
                // First, try to set the container title in metaDoc
                try {
                    const setContainerTitle = (window as any).__SET_CONTAINER_TITLE_IN_META_DOC__;
                    if (setContainerTitle) {
                        setContainerTitle(containerId, projectName);
                    }
                } catch {}

                const firestoreStore = (window as any).__FIRESTORE_STORE__;
                if (firestoreStore) {
                    const currentData = firestoreStore.userContainer || {
                        userId: "test-user-id",
                        accessibleContainerIds: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                    const ids = currentData.accessibleContainerIds || [];
                    if (!ids.includes(containerId)) {
                        ids.push(containerId);
                    }
                    firestoreStore.setUserContainer({
                        ...currentData,
                        defaultContainerId: containerId,
                        accessibleContainerIds: ids,
                        updatedAt: new Date(),
                    });
                }

                // Also update the container store directly
                const containerStore = (window as any).__CONTAINER_STORE__;
                if (containerStore && typeof containerStore.syncFromFirestore === "function") {
                    containerStore.syncFromFirestore();
                }
            }
        }, { containerId, projectName: dialogTitle || projectName });

        // Wait for the page to update and the project to appear
        await page.waitForTimeout(500);

        await expect(page.locator(`text=${dialogTitle || projectName}`)).toBeVisible({ timeout: 10000 });

        // Verify the project is no longer in the trash
        await page.goto("/projects/trash");
        await expect(page.locator(`text=${dialogTitle || projectName}`)).not.toBeVisible();
    });
});
