import { test as base } from "@playwright/test";
import util from "util";
import { isSingleSpecRun } from "../../playwright.config";

export const test = base.extend({
    page: async ({ page }, use) => {
        if (isSingleSpecRun) {
            page.on("console", async msg => {
                const args = await Promise.all(
                    msg.args().map(a => a.jsonValue().catch(() => "[unserializable]")),
                );
                const text = args
                    .map(v => typeof v === "object" ? util.inspect(v, { depth: 1 }) : String(v))
                    .join(" ");
                const label = `[browser:${msg.type()}]`;
                (msg.type() === "error" ? console.error : console.log)(`${label} ${text}`);
            });
        }
        await use(page);
    },
});

export { expect } from "@playwright/test";
