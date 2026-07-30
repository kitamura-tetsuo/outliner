import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/** @feature ENV-4c8be21f
 *  Title   : Reproducible E2E bootstrap for restricted environments
 *  Source  : docs/dev-features/env-sandbox-e2e-bootstrap-4c8be21f.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf-8");

describe("bootstrap-e2e.sh", () => {
    const scriptPath = path.join(repoRoot, "scripts", "bootstrap-e2e.sh");

    test("is executable", () => {
        // eslint-disable-next-line no-bitwise
        expect(fs.statSync(scriptPath).mode & 0o111).not.toBe(0);
    });

    test("prepares dependencies, browser and services, then runs a spec", () => {
        const content = read("scripts/bootstrap-e2e.sh");
        expect(content).toMatch(/install_all_dependencies/);
        expect(content).toMatch(/ensure_playwright_browsers/);
        expect(content).toMatch(/setup\.sh/);
        expect(content).toMatch(/test\.sh/);
        expect(content).toMatch(/--no-test/);
    });
});

describe("degraded network handling", () => {
    test("OS package installation is skipped when apt-get is unusable", () => {
        const functions = read("scripts/common-functions.sh");
        expect(functions).toMatch(/apt_is_available\(\)/);
        expect(functions).toMatch(/SKIP_APT_INSTALL/);
        // Both apt consumers must go through the probe instead of failing setup.
        expect(functions).toMatch(
            /if apt_is_available; then[\s\S]*install_os_utilities|install_os_utilities[\s\S]*if apt_is_available; then/,
        );
        expect(read("scripts/setup.sh")).toMatch(/if apt_is_available; then/);
    });

    test("a pre-installed Chromium is used when the browser download fails", () => {
        const functions = read("scripts/common-functions.sh");
        expect(functions).toMatch(/ensure_playwright_browsers\(\)/);
        expect(functions).toMatch(/\.playwright-chromium-path/);
        expect(functions).toMatch(/PLAYWRIGHT_BROWSERS_PATH/);
    });

    test("playwright.config.ts launches the recorded Chromium", () => {
        const config = read("client/playwright.config.ts");
        expect(config).toMatch(/\.playwright-chromium-path/);
        expect(config).toMatch(/PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
        expect(config).toMatch(/executablePath/);
    });

    test("test.sh does not fail when dprint cannot download its plugins", () => {
        const testScript = read("scripts/test.sh");
        expect(testScript).toMatch(/SKIP_DPRINT/);
        expect(testScript).toMatch(/elif ! npx dprint fmt; then/);
    });

    test("the recorded browser path stays out of version control", () => {
        expect(read(".gitignore")).toMatch(/^\.playwright-chromium-path$/m);
    });
});
