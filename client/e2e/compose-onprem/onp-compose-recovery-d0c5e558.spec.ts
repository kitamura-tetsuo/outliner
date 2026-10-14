import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    assertRecovered,
    captureIdentities,
    compose,
    composeOutput,
    login,
    observeExternalRequests,
    origin,
} from "./onpremComposeHelpers";

async function expectUnauthenticatedRefusals(page: import("@playwright/test").Page) {
    const request = page.context().request;
    expect((await request.get(`${origin}/api/projects`)).status()).toBe(401);
    expect((await request.post(`${origin}/api/projects`, {
        data: { projectId: "unauthorized-project", title: "Must not persist" },
    })).status()).toBe(401);
    const closeCode = await page.evaluate(async base => {
        const socket = new WebSocket(base.replace("http", "ws") + "/projects/unauthorized-project");
        return await new Promise<number>((resolve, reject) => {
            // Hocuspocus authenticates on its first Auth/Token message rather
            // than during the bare WebSocket upgrade. Send an empty token.
            socket.addEventListener("open", () => socket.send(new Uint8Array([2, 0, 0])), { once: true });
            socket.addEventListener("close", event => resolve(event.code), { once: true });
            socket.addEventListener("error", () => undefined, { once: true });
            setTimeout(() => reject(new Error("unauthenticated WebSocket was not refused")), 5000);
        });
    }, origin);
    expect(closeCode).toBe(4001);
}

function inspectContainer(containerId: string, field: string) {
    return execFileSync("docker", ["inspect", containerId, "--format", field], { encoding: "utf8" }).trim();
}

test("the Compose artifact refuses unauthorized access and preserves canonical state", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const externalRequests: string[] = [];
    await observeExternalRequests(page.context(), externalRequests);
    await page.goto(origin);
    await expectUnauthenticatedRefusals(page);
    await login(page, "wrong-password");
    await expect(page.getByText("Incorrect password")).toBeVisible();
    await login(page);

    const title = `Compose-${Date.now()}`;
    await page.getByRole("link", { name: /Create New Outliner/ }).click();
    await page.getByLabel("Outliner Name").fill(title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("New page name").fill("Release 1.0");
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
    await gridPanel.getByTestId("yjs-table-select-existing").click();
    await expect(page.getByTestId("yjs-table-grid").last().getByText("Persisted row")).toBeVisible();
    const expected = await captureIdentities(page, title);

    const stoppedContainer = composeOutput("ps", "-q", "app").trim();
    compose("stop", "app");
    expect(inspectContainer(stoppedContainer, "{{.State.ExitCode}}")).toBe("0");
    expect(inspectContainer(stoppedContainer, "{{.State.OOMKilled}}")).toBe("false");
    expect(composeOutput("logs", "--no-color", "app")).toContain("On-premises server shut down cleanly");
    compose("up", "-d", "--force-recreate", "--wait");
    expect((await page.context().request.get(`${origin}/api/projects`)).status()).toBe(401);
    await page.context().close();

    const recoveredContext = await browser.newContext();
    await observeExternalRequests(recoveredContext, externalRequests);
    const recovered = await recoveredContext.newPage();
    await login(recovered);
    await assertRecovered(recovered, title, expected);
    await recoveredContext.close();

    compose("kill", "-s", "KILL", "app");
    compose("up", "-d", "--force-recreate", "--wait");
    const crashContext = await browser.newContext();
    await observeExternalRequests(crashContext, externalRequests);
    const afterCrash = await crashContext.newPage();
    await login(afterCrash);
    await assertRecovered(afterCrash, title, expected);
    await crashContext.close();

    const originalDataDir = process.env.OUTLINER_DATA_DIR!;
    const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-compose-restore-"));
    const restoredDataDir = path.join(restoreRoot, "data");
    compose("down");
    fs.cpSync(originalDataDir, restoredDataDir, { recursive: true });
    process.env.OUTLINER_DATA_DIR = restoredDataDir;
    compose("up", "-d", "--force-recreate", "--wait");
    const restoredContext = await browser.newContext();
    await observeExternalRequests(restoredContext, externalRequests);
    const restored = await restoredContext.newPage();
    await login(restored);
    await assertRecovered(restored, title, expected);
    await restoredContext.close();

    compose("down");
    const corruptDataDir = path.join(restoreRoot, "corrupt");
    fs.mkdirSync(corruptDataDir);
    fs.writeFileSync(path.join(corruptDataDir, "projects.sqlite"), "not a sqlite database");
    process.env.OUTLINER_DATA_DIR = corruptDataDir;
    compose("up", "-d", "app");
    await expect.poll(() => composeOutput("ps", "-a", "-q", "app").trim()).not.toBe("");
    const failedContainer = composeOutput("ps", "-a", "-q", "app").trim();
    await expect.poll(() => inspectContainer(failedContainer, "{{.State.Status}}")).toBe("exited");
    expect(composeOutput("logs", "--no-color", "app")).toMatch(/database|sqlite|storage/i);
    expect(inspectContainer(failedContainer, "{{.State.ExitCode}}")).not.toBe("0");

    compose("down");
    process.env.OUTLINER_DATA_DIR = originalDataDir;
    compose("up", "-d", "--force-recreate", "--wait");
    const finalContext = await browser.newContext();
    await observeExternalRequests(finalContext, externalRequests);
    const finalPage = await finalContext.newPage();
    await login(finalPage);
    await assertRecovered(finalPage, title, expected);
    await finalContext.close();
    compose("down");
    fs.rmSync(restoreRoot, { recursive: true, force: true });
    expect(externalRequests).toEqual([]);
});
