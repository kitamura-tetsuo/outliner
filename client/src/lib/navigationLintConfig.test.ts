import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const bracketRouteFiles = [
    "src/routes/[project]/+layout.svelte",
    "src/routes/[project]/[page]/+page.svelte",
    "src/routes/[project]/[page]/schedule/+page.svelte",
    "src/routes/[project]/-/tables/[tableId]/schedule/+page.svelte",
    "src/routes/[demoProject=demoProject]/[page]/+page.svelte",
    "src/routes/[demoProject=demoProject]/-/tables/[tableId]/schedule/+page.svelte",
    "src/routes/share/[token]/+page.svelte",
];

describe("typed-navigation ESLint scope", () => {
    it("enables the official navigation rule for every migrated bracket route", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });

        for (const file of bracketRouteFiles) {
            const config = await eslint.calculateConfigForFile(file);
            expect(config?.rules?.["svelte/no-navigation-without-resolve"], file).toEqual([2]);
        }
    });

    it(
        "reports unresolved native navigation through the real route configuration",
        async () => {
            const eslint = new ESLint({ cwd: process.cwd() });
            const [result] = await eslint.lintText('<a href="/unresolved">bad</a>', {
                filePath: "src/routes/[project]/[page]/+page.svelte",
            });

            expect(
                result.messages.some((message) =>
                    message.ruleId === "svelte/no-navigation-without-resolve" && message.severity === 2
                ),
            ).toBe(true);
        },
        60_000,
    );

    it("accepts resolved shared props and rejects the same props widened to string", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });

        for (const file of ["src/components/Breadcrumb.svelte", "src/components/PageListItem.svelte"]) {
            const source = await readFile(file, "utf8");
            const [resolvedResult] = await eslint.lintText(source, { filePath: file });
            expect(
                resolvedResult.messages.filter((message) => message.ruleId === "svelte/no-navigation-without-resolve"),
                file,
            ).toEqual([]);

            const unresolvedSource = source.replaceAll("ResolvedPathname", "string");
            const [unresolvedResult] = await eslint.lintText(unresolvedSource, { filePath: file });
            expect(
                unresolvedResult.messages.some((message) =>
                    message.ruleId === "svelte/no-navigation-without-resolve" && message.severity === 2
                ),
                file,
            ).toBe(true);
        }
    });
});
