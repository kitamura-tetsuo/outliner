import { test, expect } from '@playwright/test';

test.describe('CHT-001 - ChartComponent E2E Tests', () => {
    test('ChartComponent renders correctly with sample data', async ({ page }) => {
        // Navigate to the test page
        await page.goto('/test/chartcomponent');

        // Verify Heading
        await expect(page.locator('h1')).toHaveText('ChartComponent Test Page');

        // Verify SVG chart container is visible
        // Assuming ChartComponent.svelte renders an SVG with id="chart-svg" or a known unique selector
        // Based on ChartComponent.svelte, it renders an <svg> element directly.
        // Let's target the SVG element within the component's typical structure, or add an ID if needed.
        // For now, assuming it's the only SVG on the page or has a specific class/id.
        // The component uses <svg id="chart-svg" ...>
        const chartSvg = page.locator('#chart-svg');
        await expect(chartSvg).toBeVisible();
        await expect(chartSvg).toHaveAttribute("width", "100%"); // From component
        await expect(chartSvg).toHaveAttribute("height", "100%"); // From component


        // Verify Bars
        // D3 usually renders bars as <rect> elements
        const bars = chartSvg.locator('rect.bar'); // Assuming bars have a class 'bar'
        await expect(bars).toHaveCount(3); // Based on sampleData length

        // Verify Axes (basic check)
        // D3 often uses <g class="tick"> for axis ticks.
        // X-axis ticks (typically at the bottom)
        const xAxisTicks = chartSvg.locator('g.x-axis g.tick');
        await expect(xAxisTicks.first()).toBeVisible();
        await expect(xAxisTicks).toHaveCount(3); // One tick per label

        // Y-axis ticks (typically on the left)
        const yAxisTicks = chartSvg.locator('g.y-axis g.tick');
        await expect(yAxisTicks.first()).toBeVisible();
        // Check if there's at least one y-axis tick, count can be variable based on D3 scale
        await expect(yAxisTicks.count()).toBeGreaterThan(0);


        // Verify a specific bar's properties and label
        // Check for 'Banana' label
        const bananaLabel = xAxisTicks.filter({ hasText: 'Banana' });
        await expect(bananaLabel).toBeVisible();
        await expect(bananaLabel).toHaveText('Banana');

        // Find the 'Banana' bar. This is a bit more complex as D3 might not directly link label and bar.
        // We can infer based on order or x-position if labels/bars are consistently ordered.
        // For simplicity, let's check the attributes of the tallest bar if possible,
        // or just ensure all bars have a positive height.
        for (const bar of await bars.all()) {
            const barHeight = await bar.getAttribute('height');
            expect(parseFloat(barHeight || '0')).toBeGreaterThan(0);
        }

        // Check if the 'Banana' bar (expected to be the tallest) has the largest height.
        // This requires getting all bar heights and comparing.
        let maxHeight = 0;
        for (let i = 0; i < 3; i++) {
            const barHeight = await bars.nth(i).getAttribute('height');
            const height = parseFloat(barHeight || '0');
            if (height > maxHeight) {
                maxHeight = height;
            }
        }

        const bananaBarIndex = 1; // Banana is the second item in sampleData
        const bananaBarHeight = parseFloat(await bars.nth(bananaBarIndex).getAttribute('height') || '0');
        expect(bananaBarHeight).toBe(maxHeight);

    });
});
