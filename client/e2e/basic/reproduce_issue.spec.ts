import { expect, test } from "@playwright/test";
import * as dotenv from "dotenv";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

dotenv.config({ path: ".env.test" });

const TARGET_URL = "https://outliner-d57b0.web.app/projects/containers";

test.describe("Production Reproduction", () => {
    test("Create New Project", async ({ page }) => {
        // 1. Navigate to the target page
        console.log(`Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL);

        // 2. Wait for page load
        await expect(page.locator("body")).toBeVisible();

        // 3. Create a new project
        const projectName = `Test Project ${Date.now()}`;
        console.log(`Creating project: ${projectName}`);

        // Click "New Project" button (assuming standard location/selector)
        // Adjust selector based on basic.spec.ts or page inspection
        // Based on typical behavior, there is a "New Project" button or input

        // Wait for the container list to be visible or the "New Project" button
        const newProjectBtn = page.getByRole("button", { name: "New Project" });
        // Or specific selector from basic.spec.ts if available
        // Fallback to searching for the button

        // Let's assume there is a button "New Project" or similar.
        // We will try to find a button with text "New Project" or icon

        // Trying to find the input for new project name first if it exists directly?
        // Usually clicking "New Project" opens a modal or prompts.

        // Looking at common patterns in this app (from snippets):
        // It likely has a "Create" button.

        // Let's try to match the "create new project" flow.
        // We will assert failure if we can't find it.

        // Just fail for now if we don't know the selector?
        // No, let's use a generous selector strategy.

        // Wait for potential auth redirect if not logged in?
        // Production might require login.
        // If login required, we might fail.

        // But the user said "connect to ... and confirm".
        // Maybe they are already logged in or it's public?
        // Usually requires login.

        // Start by checking if we are redirected to login.
        await page.waitForTimeout(3000); // Wait for redirects

        if (page.url().includes("login")) {
            console.log("Redirected to login page. Cannot proceed without credentials.");
            // In a real reproduction I would need credentials.
            // But maybe I can just verify we reach the server?
            // The user said "create new project without error".
            throw new Error("Redirected to login on production. Need credentials.");
        }

        // Assuming we are authenticated or it's allowed:
        // Try to find the "New Project" button.
        const createButton = page.getByRole("button", { name: /New Project|Create/i }).first();
        if (await createButton.isVisible()) {
            await createButton.click();
            await page.getByRole("textbox", { name: /Name|Title/i }).fill(projectName);
            await page.getByRole("button", { name: /Create|Save|Add/i }).last().click();
        } else {
            // Maybe it's a floating action button or just an input?
            // Let's try finding an input directly.
            const input = page.getByPlaceholder(/Project Name|New Project/i);
            if (await input.isVisible()) {
                await input.fill(projectName);
                await input.press("Enter");
            } else {
                throw new Error("Could not find Create Project UI");
            }
        }

        // 4. Verify success
        // Should navigate to the project page or show it in list
        // Project ID is likely in URL
        await expect(page).toHaveURL(/\/projects\/p[a-f0-9]+/);
        console.log("Project created successfully!");
    });
});
