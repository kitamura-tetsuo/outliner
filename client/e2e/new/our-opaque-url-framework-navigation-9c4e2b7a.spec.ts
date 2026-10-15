import { expect, test } from "@playwright/test";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const languageOrigin = "http://127.0.0.1:7189";
const debugOrigin = "http://127.0.0.1:7190";

async function waitForServer(origin: string, pathname: string): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${origin}${pathname}`);
            if (response.ok) return;
        } catch {
            // Vite has not started listening yet.
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Vite fixture did not start at ${origin}`);
}

function launchFixture(port: number, nodeEnv: "test" | "development", base = ""): ChildProcess {
    return spawn(
        path.join(clientRoot, "node_modules/.bin/vite"),
        [
            "dev",
            "--config",
            "e2e/fixtures/nonempty-base-vite.config.ts",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--mode",
            "test",
        ],
        {
            cwd: clientRoot,
            env: {
                ...process.env,
                NODE_ENV: nodeEnv,
                OPAQUE_URL_TEST_BASE: base,
                VITE_IS_TEST: "true",
                VITE_USE_FIREBASE_EMULATOR: "true",
            },
            stdio: "inherit",
        },
    );
}

async function stopFixture(server: ChildProcess | undefined): Promise<void> {
    if (!server || server.exitCode !== null) return;
    server.kill("SIGTERM");
    await once(server, "exit");
}

test.describe("language switch framework navigation", () => {
    let server: ChildProcess | undefined;

    test.beforeAll(async () => {
        server = launchFixture(7189, "test");
        await waitForServer(languageOrigin, "/paraglide");
    });

    test.afterAll(async () => {
        await stopFixture(server);
    });

    test("uses SvelteKit navigation for the supported language switch", async ({ page }) => {
        await page.goto(`${languageOrigin}/paraglide`);
        await expect(page.getByRole("heading", { name: "Paraglide Demo" })).toBeVisible();

        await page.getByRole("button", { name: "ja" }).click();
        await expect(page).toHaveURL(`${languageOrigin}/ja/paraglide`);
    });
});

test.describe("debug bridge framework navigation", () => {
    let server: ChildProcess | undefined;

    test.beforeAll(async () => {
        server = launchFixture(7190, "development", "/app");
        await waitForServer(debugOrigin, "/app/paraglide");
    });

    test.afterAll(async () => {
        await stopFixture(server);
    });

    test("navigates an encoded opaque URL from a nested route under /app", async ({ page }) => {
        // The bridge must be installed by the root layout, rather than imported
        // or initialized by this test.
        await page.goto(`${debugOrigin}/app/demo/Home`);
        await expect.poll(() => page.evaluate(() => typeof globalThis.__SVELTE_GOTO__)).toBe("function");

        await page.evaluate(() => {
            void globalThis.__SVELTE_GOTO__!("/Project%20A/Page%20B?isTest=true#frag");
        });
        await expect(page).toHaveURL(`${debugOrigin}/app/Project%20A/Page%20B?isTest=true#frag`);
        await expect(page).toHaveTitle("Page B - Project A | Outliner");
    });
});
