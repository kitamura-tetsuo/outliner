import { describe, expect, it } from "vitest";
import { serializeGridToHtml, serializeGridToTsv } from "./gridClipboardExport";

describe("gridClipboardExport", () => {
    describe("serializeGridToTsv", () => {
        it("exports TSV with basic values and handles nulls", () => {
            const result = serializeGridToTsv({
                columns: ["c1", "c2"],
                hiddenColumns: {},
                labels: { c1: "Col 1", c2: "Col 2" },
                rows: [
                    { c1: "A", c2: "B" },
                    { c1: null, c2: "" },
                ],
            });
            expect(result.text).toBe("Col 1\tCol 2\nA\tB\n\t");
            expect(result.truncated).toBe(false);
        });

        it("quotes values according to RFC 4180", () => {
            const result = serializeGridToTsv({
                columns: ["c1"],
                hiddenColumns: {},
                labels: { c1: "Header\nnewline" },
                rows: [
                    { c1: 'has "quotes"' },
                    { c1: "has\ttabs" },
                ],
            });
            expect(result.text).toBe('"Header\nnewline"\n"has ""quotes"""\n"has\ttabs"');
        });

        it("respects hidden columns and limits", () => {
            const result = serializeGridToTsv({
                columns: ["c1", "c2", "c3"],
                hiddenColumns: { c2: true },
                labels: {},
                rows: [
                    { c1: 1, c2: 2, c3: 3 },
                    { c1: 4, c2: 5, c3: 6 },
                    { c1: 7, c2: 8, c3: 9 },
                ],
                rowLimit: 2,
            });
            expect(result.text).toBe("c1\tc3\n1\t3\n4\t6\n--- Copy limit reached ---");
            expect(result.truncated).toBe(true);
        });
    });

    describe("serializeGridToHtml", () => {
        it("exports HTML table and escapes special characters", () => {
            const result = serializeGridToHtml({
                columns: ["c1", "c2"],
                hiddenColumns: {},
                labels: { c1: "A & B", c2: "<C>" },
                rows: [
                    { c1: "row\n1", c2: 'a "b" c' },
                ],
            });
            expect(result.html).toContain("<th>A &amp; B</th>");
            expect(result.html).toContain("<th>&lt;C&gt;</th>");
            expect(result.html).toContain("<td>row<br>1</td>");
            expect(result.html).toContain("<td>a &quot;b&quot; c</td>");
        });

        it("respects limits", () => {
            const result = serializeGridToHtml({
                columns: ["c1"],
                hiddenColumns: {},
                labels: {},
                rows: [{ c1: 1 }, { c1: 2 }],
                rowLimit: 1,
            });
            expect(result.html).toContain("--- Copy limit reached ---");
            expect(result.truncated).toBe(true);
        });
    });
});
