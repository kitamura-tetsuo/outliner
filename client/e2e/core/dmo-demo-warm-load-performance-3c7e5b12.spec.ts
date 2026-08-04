import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// FTR-3c7e5b12: a warm /demo visit (template already valid, no reset needed)
// must reach an interactive page list in the same practical range as a normal
// project page list. The generous test timeout below only bounds the whole
// measurement loop; the warm-path budget is asserted separately on the
// measured medians.
const WARM_RUNS = 10;
/**
 * Budget on a developer machine: the demo median must land within 300 ms of the
 * paired normal-project baseline and stay under 1500 ms.
 *
 * Both numbers are scaled by the measured baseline, because the paired baseline
 * is what "the same practical range as a normal project page" means on any given
 * machine — a CI runner is routinely 2x slower than a laptop and its own
 * per-sample spread there is ±20%. The scaled form still fails hard if the demo
 * drifts back toward the ~2x-baseline serial waterfall this replaces.
 */
const MAX_MEDIAN_GAP_MS = 300;
const MAX_DEMO_MEDIAN_MS = 1500;
const BASELINE_GAP_RATIO = 0.3;
const BASELINE_CEILING_RATIO = 2;

function percentile(samples: number[], p: number): number {
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
    return sorted[Math.max(0, index)];
}

const median = (samples: number[]) => percentile(samples, 0.5);

test.describe("Demo warm load performance", () => {
    test.setTimeout(240000);

    test("a warm /demo visit reaches the page list as fast as a normal project list", async ({ page }) => {
        // Baseline: a seeded normal project, measured on the same browser.
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Baseline item",
        ]);

        const baselineUrl = `/${encodeURIComponent(projectName)}?isTest=true`;

        async function measureBaseline(): Promise<number> {
            const started = Date.now();
            await page.goto(baselineUrl);
            await expect(page.getByText("Page List", { exact: true })).toBeVisible({ timeout: 30000 });
            return Date.now() - started;
        }

        async function measureDemo(): Promise<number> {
            const started = Date.now();
            await page.goto("/demo");
            await expect(page.getByTestId("demo-page-list").getByText("Welcome", { exact: true }).first())
                .toBeVisible({ timeout: 30000 });
            return Date.now() - started;
        }

        // Warm-up pair (the first demo visit may still seed the template, and
        // neither route has warm caches yet); its samples are discarded.
        await measureBaseline();
        await page.goto("/demo");
        await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 60000 });

        // Interleaved so machine noise lands on both routes equally.
        const baselineSamples: number[] = [];
        const demoSamples: number[] = [];
        for (let run = 0; run < WARM_RUNS; run++) {
            baselineSamples.push(await measureBaseline());
            demoSamples.push(await measureDemo());
        }

        const baselineMedianMs = median(baselineSamples);
        const demoMedianMs = median(demoSamples);
        const maxGapMs = Math.max(MAX_MEDIAN_GAP_MS, baselineMedianMs * BASELINE_GAP_RATIO);
        const maxDemoMedianMs = Math.max(MAX_DEMO_MEDIAN_MS, baselineMedianMs * BASELINE_CEILING_RATIO);

        const report = {
            baselineMedianMs,
            baselineP95Ms: percentile(baselineSamples, 0.95),
            demoMedianMs,
            demoP95Ms: percentile(demoSamples, 0.95),
            maxGapMs,
            maxDemoMedianMs,
            demoSamples,
            baselineSamples,
        };
        test.info().annotations.push({ type: "warm-load", description: JSON.stringify(report) });
        console.log("[dmo-warm-load]", JSON.stringify(report));

        expect(demoMedianMs).toBeLessThanOrEqual(baselineMedianMs + maxGapMs);
        expect(demoMedianMs).toBeLessThanOrEqual(maxDemoMedianMs);
    });
});
