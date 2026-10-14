import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const origin = `http://127.0.0.1:${process.env.OUTLINER_ONPREM_PORT ?? "7070"}`;
const password = process.env.OUTLINER_LOCAL_PASSWORD!;
const repository = new URL("../../..", import.meta.url).pathname;

function compose(...args: string[]) {
    execFileSync("docker", ["compose", "-f", "compose.onprem.yml", ...args], {
        cwd: repository,
        env: process.env,
        stdio: "inherit",
    });
}

async function login(page: import("@playwright/test").Page, supplied = password) {
    await page.goto(origin);
    await page.getByLabel("Password").fill(supplied);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    if (supplied === password) {
        await expect(page.getByRole("link", { name: /Create New Outliner/ })).toBeVisible();
    }
}

test("the Compose artifact persists a UI-created outline, Table, and bound Grid across recreation", async ({ page, browser }) => {
    const externalRequests: string[] = [];
    await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1") {
            externalRequests.push(url.href);
            return route.abort("blockedbyclient");
        }
        return route.continue();
    });
    await login(page, "wrong-password");
    await expect(page.getByText("Incorrect password")).toBeVisible();
    await login(page);

    const title = `Compose-${Date.now()}`;
    await page.getByRole("link", { name: /Create New Outliner/ }).click();
    await page.getByLabel("Outliner Name").fill(title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("New page name").fill("Recovery");
    await page.getByRole("button", { name: "Create new page" }).click();
    await page.getByTestId("add-item-button").click();
    await page.getByTestId("outliner-base").locator(".outliner-item[data-item-id]").nth(1).click();
    await page.keyboard.type("Retained by Compose");

    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel").first();
    await panel.getByTestId("yjs-table-name-input").fill("Recovery Tasks");
    await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await panel.getByTestId("yjs-table-create").click();
    await page.getByTestId("yjs-table-add-row").first().click();
    const row = page.getByTestId("yjs-table-grid").first().locator("tbody tr").last();
    await row.locator("td[data-col='title'] button").click();
    await row.locator("td[data-col='title'] input").fill("Persisted row");
    await page.keyboard.press("Enter");
    await row.locator("td[data-col='done'] input[type=checkbox]").check();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const gridPanel = page.getByTestId("yjs-table-create-panel").last();
    await gridPanel.getByRole("button", { name: "New Grid over Existing Table" }).click();
    const sourceId = await gridPanel.getByTestId("yjs-table-existing-select").inputValue();
    expect(sourceId).not.toBe("");
    await gridPanel.getByTestId("yjs-table-select-existing").click();
    await expect(page.getByTestId("yjs-table-grid").last().getByText("Persisted row")).toBeVisible();

    await expect.poll(async () => (await fetch(`${origin}/health`)).ok).toBe(true);
    await page.context().close();
    compose("stop", "app");
    compose("up", "-d", "--force-recreate", "--wait");

    const recovered = await browser.newPage();
    await login(recovered);
    await recovered.goto(`${origin}/${encodeURIComponent(title)}/Recovery`);
    await expect(recovered.getByText("Retained by Compose")).toBeVisible();
    await expect(recovered.getByTestId("yjs-table-grid")).toHaveCount(2);
    const recoveredRow = recovered.getByTestId("yjs-table-grid").last().locator("tbody tr", {
        hasText: "Persisted row",
    });
    await expect(recoveredRow).toBeVisible();
    await expect(recoveredRow.locator("td[data-col='done'] input[type=checkbox]")).toBeChecked();
    await recovered.context().close();

    // The preceding fresh-browser read positively observes committed storage
    // before the crash boundary. No old client can repopulate the server.
    compose("kill", "-s", "KILL", "app");
    compose("up", "-d", "--force-recreate", "--wait");
    const afterCrash = await browser.newPage();
    await login(afterCrash);
    await afterCrash.goto(`${origin}/${encodeURIComponent(title)}/Recovery`);
    await expect(afterCrash.getByText("Retained by Compose")).toBeVisible();
    await expect(afterCrash.getByText("Persisted row").first()).toBeVisible();
    await afterCrash.context().close();

    const originalDataDir = process.env.OUTLINER_DATA_DIR!;
    const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-compose-restore-"));
    const restoredDataDir = path.join(restoreRoot, "data");
    compose("down");
    fs.cpSync(originalDataDir, restoredDataDir, { recursive: true });
    process.env.OUTLINER_DATA_DIR = restoredDataDir;
    compose("up", "-d", "--force-recreate", "--wait");
    const restored = await browser.newPage();
    await login(restored);
    await expect.poll(async () => {
        const response = await restored.context().request.get(`${origin}/api/projects`);
        return response.ok() ? await response.json() : { projects: [] };
    }).toEqual({ projects: [{ projectId: expect.any(String), title }] });
    await restored.goto(`${origin}/${encodeURIComponent(title)}/Recovery`);
    await expect(restored.getByText("Retained by Compose")).toBeVisible();
    await expect(restored.getByText("Persisted row").first()).toBeVisible();
    await restored.context().close();
    compose("down");
    fs.rmSync(restoreRoot, { recursive: true, force: true });
    expect(externalRequests).toEqual([]);
});
