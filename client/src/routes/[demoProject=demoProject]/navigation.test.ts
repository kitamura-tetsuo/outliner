import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// Every link a demo route emits must be built from the project it is showing.
// A literal "/demo" here is the bug that made `/demo-ja` visitors land in the
// English demo: the route renders under both slugs, so a fixed path silently
// crosses projects. The components were fixed for this; the routes' own
// breadcrumbs and toolbar links are just as capable of it.
const routeFiles = [
    "+page.svelte",
    "[page]/+page.svelte",
    "[page]/diff/+page.svelte",
    "graph/+page.svelte",
];

// vitest runs from the client package root.
const routeDir = resolve(process.cwd(), "src/routes/[demoProject=demoProject]");

describe("demo route navigation", () => {
    for (const file of routeFiles) {
        it(`${file} builds its links from the active project`, () => {
            const source = readFileSync(join(routeDir, file), "utf-8");
            const offenders = source
                .split("\n")
                .map((line, i) => ({ line, number: i + 1 }))
                .filter(({ line }) => /["'`]\/demo(\/|["'`])/.test(line));

            expect(
                offenders.map(o => `${file}:${o.number}: ${o.line.trim()}`),
                "hard-coded /demo path in a route that also serves /demo-ja",
            ).toEqual([]);
        });
    }
});
