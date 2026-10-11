/** @feature ENV-78ad2b91
 * These mutations are checked through actual Playwright collection, rather
 * than fabricated reporter output or checks for matching config strings.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCollectionFixture } from "./helpers/firefox-collection-fixture";
import { collectPlaywright, verifySelectionCoverage } from "./helpers/playwright-collection";

let fixture: ReturnType<typeof createCollectionFixture>;
beforeEach(() => {
    fixture = createCollectionFixture();
});
afterEach(() => {
    fixture.dispose();
});
const verify = () => verifySelectionCoverage(fixture.client, fixture.workflow);

describe("ENV-78ad2b91: browser-specific selection coverage guard", () => {
    it("collects every required case in both engines without adding ordinary specs to Firefox", () => {
        const actual = collectPlaywright(fixture.client);
        verifySelectionCoverage(fixture.client, fixture.workflow, actual);
        expect(
            actual.cases.filter(test => test.file === "basic/ordinary-78ad2b91.spec.ts")
                .map(test => [test.project, test.browser]),
        ).toEqual([["basic", "chromium"]]);
    }, 120_000);

    it("rejects a removed Firefox match while Chromium still collects the spec", () => {
        fixture.mutateProjects(
            'project.name === "firefox-selection-new" ? { ...project, testMatch: "**/absent.spec.ts" } : project',
        );
        expect(verify).toThrow(/Missing firefox collection: new\/slr-new/);
    }, 120_000);

    it("rejects one missing case even when Firefox still collects its file", () => {
        fixture.mutateProjects(
            'project.name === "firefox-selection-core-4" ? { ...project, grepInvert: /second probe/ } : project',
        );
        expect(verify).toThrow(/Missing firefox collection: core\/slr-alpha[^\n]+second probe/);
    }, 120_000);

    it("detects a case filtered out of both production browser suites", () => {
        fixture.mutateProjects("{ ...project, grepInvert: /second probe/ }");
        expect(verify).toThrow(/Missing chromium collection:[\s\S]+Missing firefox collection:/);
    }, 120_000);

    it("rejects an omitted normal CI project without confusing listing with execution", () => {
        fixture.removeCIProject("firefox-selection-core-4b");
        expect(verify).toThrow("Firefox project missing from normal CI matrix: firefox-selection-core-4b");
    }, 120_000);

    it("rejects an excluded Firefox project even when it remains in the matrix project list", () => {
        fixture.excludeCIProject("firefox-selection-new");
        expect(verify).toThrow("Firefox project missing from normal CI matrix: firefox-selection-new");
    }, 120_000);

    it("allows a local duplicate project when scheduled Firefox projects already cover every required case", () => {
        fixture.mutateProjects(
            'project.name === "firefox-selection-core-4" ? [project, { ...project, name: "local-firefox-debug" }] : project',
        );
        expect(verify).not.toThrow();
    }, 120_000);

    it.each(["E2E_BROWSER", "E2E_PROJECT"])(
        "rejects declarations removed only under the CI %s environment",
        variable => {
            fs.writeFileSync(
                path.join(fixture.client, "e2e/core/slr-alpha-78ad2b91.spec.ts"),
                'import { test } from "@playwright/test";\ntest("first probe", async () => {});\n'
                    + `if (!String(process.env.${variable}).startsWith("firefox")) test("second probe", async () => {});`,
            );
            expect(verify).toThrow(/Missing firefox collection: core\/slr-alpha[^\n]+second probe/);
        },
        120_000,
    );

    it("does not identify an engine from its project name", () => {
        fixture.mutateProjects(
            'project.name.startsWith("firefox-") ? { ...project, use: { ...project.use, browserName: "chromium" } } : project',
        );
        expect(verify).toThrow(/Missing firefox collection:/);
    }, 120_000);

    it("discovers a newly added matching file and all its cases without changing project definitions", () => {
        fixture.addSpec("core/slr-added-78ad2b91.spec.ts", ["new case one", "new case two"]);
        expect(verify).not.toThrow();
    }, 120_000);

    it("preserves a relocated required spec through the explicit retained-path list", () => {
        const destination = "regressions/outline-selection-78ad2b91.spec.ts";
        fs.mkdirSync(path.join(fixture.client, "e2e/regressions"));
        fs.renameSync(
            path.join(fixture.client, "e2e/core/slr-alpha-78ad2b91.spec.ts"),
            path.join(fixture.client, "e2e", destination),
        );
        fs.writeFileSync(
            path.join(fixture.client, "playwright-selection-retained.json"),
            JSON.stringify([destination]),
        );
        expect(verify).not.toThrow();
        const actual = collectPlaywright(fixture.client);
        expect(new Set(actual.cases.filter(test => test.file === destination).map(test => test.browser)))
            .toEqual(new Set(["chromium", "firefox"]));
    }, 120_000);

    it("fails explicitly when a retained required spec no longer exists", () => {
        fs.writeFileSync(
            path.join(fixture.client, "playwright-selection-retained.json"),
            '["regressions/missing.spec.ts"]',
        );
        expect(verify).toThrow("Required selection file is missing: regressions/missing.spec.ts");
    }, 120_000);

    it("rejects an empty required spec instead of accepting vacuous case coverage", () => {
        fs.writeFileSync(path.join(fixture.client, "e2e/new/slr-new-78ad2b91.spec.ts"), "");
        expect(verify).toThrow("Required selection files contain no collected cases: new/slr-new-78ad2b91.spec.ts");
    }, 120_000);

    it("propagates a real Playwright collection error with its diagnostic", () => {
        fs.writeFileSync(
            path.join(fixture.client, "e2e/new/slr-new-78ad2b91.spec.ts"),
            'throw new Error("intentional collection failure 78ad2b91");',
        );
        expect(verify).toThrow(/Playwright collection failed:[\s\S]+intentional collection failure 78ad2b91/);
    }, 120_000);
});
