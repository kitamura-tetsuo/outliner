import { test } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightVersion: string = require("playwright/package.json").version;

/** Capture the actual test browser, independently of optional V8 coverage. */
export function registerBrowserEvidenceHooks(): void {
    // Record launch evidence even if creating a page subsequently fails.
    test.beforeEach(async ({ browser, browserName }, testInfo) => {
        if (browserName !== "firefox") return;
        await testInfo.attach("browser-runtime", {
            body: Buffer.from(JSON.stringify({
                engine: browser.browserType().name(),
                version: browser.version(),
                playwrightVersion,
                project: testInfo.project.name,
            })),
            contentType: "application/json",
        });
    });

    test.beforeEach(async ({ browserName, page }, testInfo) => {
        if (browserName !== "firefox") return;
        // A later hook/fixture teardown can still fail this attempt. Keep a live
        // attachment until the page closes rather than checking status early.
        const logPath = testInfo.outputPath("browser-console.log");
        fs.writeFileSync(logPath, "Firefox browser console\n");
        testInfo.attachments.push({ name: "browser-console", path: logPath, contentType: "text/plain" });
        const append = (message: string) => fs.appendFileSync(logPath, message + "\n");
        page.on("console", message => append(`[${message.type()}] ${message.text()}`));
        page.on("pageerror", error => append(`[pageerror] ${error.stack ?? error.message}`));
        page.on("requestfailed", request => {
            append(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`);
        });
    });
}
