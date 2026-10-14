import { type BrowserContext, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

export const origin = `http://127.0.0.1:${process.env.OUTLINER_ONPREM_PORT ?? "7070"}`;
export const password = process.env.OUTLINER_LOCAL_PASSWORD!;
const repository = new URL("../../..", import.meta.url).pathname;
const composeFiles = ["-f", "compose.onprem.yml", "-f", "compose.onprem.test.yml"];

export function compose(...args: string[]) {
    execFileSync("docker", ["compose", ...composeFiles, ...args], {
        cwd: repository,
        env: process.env,
        stdio: "inherit",
    });
}

export function composeOutput(...args: string[]) {
    return execFileSync("docker", ["compose", ...composeFiles, ...args], {
        cwd: repository,
        env: process.env,
        encoding: "utf8",
    });
}

export async function observeExternalRequests(context: BrowserContext, attempts: string[]) {
    await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1") {
            attempts.push(url.href);
            return route.abort("blockedbyclient");
        }
        return route.continue();
    });
}

export async function login(page: Page, supplied = password) {
    await page.goto(origin);
    await page.getByLabel("Password").fill(supplied);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    if (supplied === password) {
        await expect(page.getByRole("link", { name: /Create New Outliner/ })).toBeVisible();
    }
}

export interface PersistentIdentitySnapshot {
    projectId: string;
    pageId: string;
    itemIds: string[];
    gridIds: string[];
    sourceTableIds: string[];
    recordIds: string[];
}

export async function captureIdentities(page: Page, title: string): Promise<PersistentIdentitySnapshot> {
    const directory = await page.context().request.get(`${origin}/api/projects`);
    expect(directory.ok()).toBe(true);
    const projects = (await directory.json()).projects as { projectId: string; title: string; }[];
    expect(projects).toHaveLength(1);
    expect(projects[0]?.title).toBe(title);

    const pageId = await page.locator(".outliner-item[data-item-id]").first().getAttribute("data-item-id");
    const itemIds = await page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).sort()
    );
    const grids = page.getByTestId("yjs-table-view");
    const gridIds =
        (await grids.evaluateAll(elements => elements.map(element => element.getAttribute("data-grid-id")!)))
            .sort();
    const sourceTableIds =
        (await grids.evaluateAll(elements => elements.map(element => element.getAttribute("data-source-table-id")!)))
            .sort();
    const recordIds =
        (await page.locator("tr[data-record-id]").evaluateAll(elements =>
            elements.map(element => element.getAttribute("data-record-id")!).filter((id, index, all) =>
                id && all.indexOf(id) === index
            ).sort()
        )) as string[];

    expect(pageId).toBeTruthy();
    return { projectId: projects[0]!.projectId, pageId: pageId!, itemIds, gridIds, sourceTableIds, recordIds };
}

export async function assertRecovered(page: Page, title: string, expected: PersistentIdentitySnapshot) {
    await page.goto(`${origin}/${encodeURIComponent(title)}/Release%201.0`);
    await expect(page.getByText("Retained by Compose")).toBeVisible();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(2);
    const row = page.getByTestId("yjs-table-grid").last().locator("tbody tr", { hasText: "Persisted row" });
    await expect(row).toBeVisible();
    await expect(row.locator("td[data-col='done'] input[type=checkbox]")).toBeChecked();
    expect(await captureIdentities(page, title)).toEqual(expected);
}
