import { describe, expect, it } from "vitest";
import { publishGridResultBeforeAuthority } from "./gridResultPublication";

describe("Grid result publication readiness (#5692 REQ-001/REQ-004)", () => {
    it("exposes the seeded Sales read result while mutation authority is still pending", async () => {
        let releaseAuthority!: (value: { writable: boolean; }) => void;
        const authority = new Promise<{ writable: boolean; }>(resolve => releaseAuthority = resolve);
        let revenueHeader: string | undefined;
        let chartLabel: string | undefined;
        let writable: boolean | undefined;

        const publication = publishGridResultBeforeAuthority({
            isCurrent: () => true,
            publishResult: () => {
                const result = {
                    columns: ["id", "month", "revenue"],
                    rows: [{ id: "jan", month: "Jan", revenue: 120 }],
                };
                revenueHeader = result.columns[2];
                chartLabel = `Bar chart, revenue by month, Jan: ${result.rows[0].revenue}`;
            },
            resolveAuthority: () => authority,
            publishAuthority: next => writable = next.writable,
        });

        // This is the diagnosed boundary: the unchanged visible-data oracle
        // is available before metadata/INSERT authority is allowed to settle.
        expect(revenueHeader).toBe("revenue");
        expect(chartLabel).toMatch(/Bar chart.*revenue.*Jan.*120/);
        expect(writable).toBeUndefined();

        releaseAuthority({ writable: true });
        await publication;
        expect(writable).toBe(true);
    });

    it("does not publish authority when the completed result becomes stale", async () => {
        let current = true;
        let releaseAuthority!: (value: string) => void;
        const authority = new Promise<string>(resolve => releaseAuthority = resolve);
        let visible = false;
        let publishedAuthority: string | undefined;
        const publication = publishGridResultBeforeAuthority({
            isCurrent: () => current,
            publishResult: () => visible = true,
            resolveAuthority: () => authority,
            publishAuthority: value => publishedAuthority = value,
        });

        expect(visible).toBe(true);
        current = false;
        releaseAuthority("stale");
        await publication;
        expect(publishedAuthority).toBeUndefined();
    });
});
