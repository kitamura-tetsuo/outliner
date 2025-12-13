import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Trash UI", () => {
    test("should display deleted projects and allow permanent deletion", async ({ page }) => {
        // Create project and get its name
        const { projectName } = await TestHelpers.prepareTestEnvironment(page);

        // Wait for the Yjs client to be available so we can retrieve a stable container ID
        await page.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            return !!(yjsStore?.yjsClient?.containerId);
        }, { timeout: 30000 });

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

        expect(containerId).toBeTruthy();
        // Wait for the container to appear in the container store and UI
        await page.waitForFunction(
            (cid) => {
                const containerStore = (window as any).__CONTAINER_STORE__;
                return !!containerStore?.containers?.some((c: any) => c?.id === cid);
            },
            containerId,
            { timeout: 15000 },
        );
        const deletePageRow = page.locator("table tbody tr").filter({
            has: page.getByRole("cell", { name: containerId!, exact: true }),
        });
        await expect(deletePageRow).toHaveCount(1, { timeout: 15000 });
        await expect(deletePageRow).toBeVisible({ timeout: 15000 });

        // Wait for the Delete button to be visible
        const deleteButton = deletePageRow.getByRole("button", { name: "Delete", exact: true });
        await expect(deleteButton).toBeVisible({ timeout: 10000 });

        // Get the actual project title from the dialog prompt
        await deleteButton.click();

        // Wait for the delete dialog to appear
        await expect(page.getByTestId("delete-project-dialog")).toBeVisible();
        await expect(page.getByTestId("delete-project-dialog").locator("h2")).toHaveText("Delete Project");

        // Get the title from the dialog's strong element (it shows the exact title expected)
        const dialogTitle = await page.getByTestId("delete-project-dialog").locator("strong").textContent();

        await page.getByTestId("delete-project-dialog").locator("input[type='text']").fill(dialogTitle || projectName);
        await page.getByTestId("delete-project-dialog").locator("button:has-text('Delete')").click();

        // Wait for the dialog to close and the delete operation to complete
        await page.waitForTimeout(1000);

        // Go to trash and verify the project is listed
        await page.goto("/projects/trash");
        const projectTitle = dialogTitle || projectName;
        const projectRow = page.locator("tbody tr", {
            has: page.getByRole("cell", { name: projectTitle, exact: true }),
        });
        await expect(projectRow).toBeVisible();

        // Permanently delete the project
        await expect(projectRow.getByRole("button", { name: "Delete Permanently", exact: true })).toBeVisible({
            timeout: 10000,
        });
        await projectRow.getByRole("button", { name: "Delete Permanently", exact: true }).click();

        // Wait for the permanent delete dialog to appear
        await expect(page.getByTestId("delete-project-dialog")).toBeVisible();

        // Handle the confirmation dialog
        const permanentDeleteTitle = await page.getByTestId("delete-project-dialog").locator("strong").textContent();
        await page.getByTestId("delete-project-dialog").locator("input[type='text']").fill(
            permanentDeleteTitle || dialogTitle || projectName,
        );
        await page.getByTestId("delete-project-dialog").locator("button:has-text('Delete Permanently')").click();

        // Wait for the delete operation to complete
        await page.waitForTimeout(1000);

        // Verify the project is no longer in the trash
        await expect(projectRow).not.toBeVisible();
    });
});
