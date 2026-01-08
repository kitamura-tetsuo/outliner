import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { compareTestCaseSnapshots } from "../utils/snapshotComparison.js";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("snapshot comparison", () => {
    test("generate yjs snapshot for current mode", async ({ page }, testInfo) => {
        // Use standard test environment initialization
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        const name = `${testInfo.title.replace(/[^a-z0-9_-]+/gi, "-")}-auto-${Date.now()}`;
        await DataValidationHelpers.saveSnapshotsAndCompare(page, name);

        const outDir = path.resolve(process.cwd(), "e2e-snapshots");
        const yjsPath = path.join(outDir, `${name}-yjs.json`);
        expect(fs.existsSync(yjsPath)).toBeTruthy();
    });

    test("compare fluid and yjs snapshots", async () => {
        const dir = path.resolve(process.cwd(), "e2e-snapshots");
        if (!fs.existsSync(dir)) {
            console.log("snapshots dir missing");
            return;
        }
        const files = fs.readdirSync(dir);
        const fluid = new Map();
        const yjs = new Map();
        const base = (f: string) => f.replace(/-(fluid|yjs)\.json$/, "").replace(/-auto-\d+$/, "");
        for (const f of files) {
            if (f.endsWith("-fluid.json")) fluid.set(base(f), f);
            if (f.endsWith("-yjs.json")) yjs.set(base(f), f);
        }
        const cases = [...fluid.keys()].filter(k => yjs.has(k));
        if (cases.length === 0) {
            console.log("no pair snapshots");
            return;
        }

        for (const k of cases) {
            const fr = path.join(dir, fluid.get(k)!);
            const yr = path.join(dir, yjs.get(k)!);
            const res = compareTestCaseSnapshots(fr, yr);
            if (!res.success) {
                console.log(`❌ [${k}] diffs:`);
                for (const [i, d] of (res.differences ?? []).entries()) console.log(`  ${i + 1}. ${d}`);
            }
            expect(res.success).toBeTruthy();
        }
    });
});
