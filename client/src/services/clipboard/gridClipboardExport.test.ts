import { describe, expect, it } from "vitest";
import { GRID_EXPORT_ROW_LIMIT, serializeGridToHtml, serializeGridToTsv } from "./gridClipboardExport";

describe("gridClipboardExport", () => {
    describe("serializeGridToTsv", () => {
        it("writes a header of labels and one line per row", () => {
            const result = serializeGridToTsv({
                columns: ["c1", "c2"],
                hiddenColumns: {},
                labels: { c1: "Col 1", c2: "Col 2" },
                rows: [
                    { c1: "A", c2: "B" },
                    { c1: null, c2: "" },
                ],
            });
            // NULL and the empty string are both an empty cell (§7.1).
            expect(result.text).toBe("Col 1\tCol 2\nA\tB\n\t");
            expect(result.truncated).toBe(false);
        });

        it("falls back to the SQL name when a column has no label", () => {
            const result = serializeGridToTsv({
                columns: ["revenue", "month"],
                hiddenColumns: {},
                labels: { revenue: "", month: undefined },
                rows: [],
            });
            expect(result.text).toBe("revenue\tmonth");
        });

        it("quotes values and labels per RFC 4180", () => {
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

        it("keeps the caller's column order and drops hidden columns", () => {
            const result = serializeGridToTsv({
                columns: ["c3", "c2", "c1"],
                hiddenColumns: { c2: true },
                labels: {},
                rows: [{ c1: 1, c2: 2, c3: 3 }],
            });
            expect(result.text).toBe("c3\tc1\n3\t1");
        });

        it("caps the rows and says how many it kept", () => {
            const result = serializeGridToTsv({
                columns: ["c1"],
                hiddenColumns: {},
                labels: {},
                rows: [{ c1: 1 }, { c1: 2 }, { c1: 3 }],
                rowLimit: 2,
            });
            expect(result.text).toBe("c1\n1\n2\n--- Copy limit reached: first 2 of 3 rows ---");
            expect(result.truncated).toBe(true);
        });

        it("defaults the cap to the shared row limit", () => {
            const rows = Array.from({ length: GRID_EXPORT_ROW_LIMIT + 1 }, (_, index) => ({ c1: index }));
            const result = serializeGridToTsv({ columns: ["c1"], hiddenColumns: {}, labels: {}, rows });
            expect(result.truncated).toBe(true);
            expect(result.text.split("\n")).toHaveLength(GRID_EXPORT_ROW_LIMIT + 2);
        });
    });

    describe("serializeGridToHtml", () => {
        it("writes a table and escapes markup", () => {
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

        it("emits NULL and the empty string as empty cells", () => {
            const result = serializeGridToHtml({
                columns: ["c1", "c2"],
                hiddenColumns: {},
                labels: {},
                rows: [{ c1: null, c2: "" }],
            });
            expect(result.html).toContain("      <td></td>\n      <td></td>");
        });

        it("caps the rows and carries the notice", () => {
            const result = serializeGridToHtml({
                columns: ["c1"],
                hiddenColumns: {},
                labels: {},
                rows: [{ c1: 1 }, { c1: 2 }],
                rowLimit: 1,
            });
            expect(result.html).toContain("<p><i>--- Copy limit reached: first 1 of 2 rows ---</i></p>");
            expect(result.truncated).toBe(true);
        });
    });
});
