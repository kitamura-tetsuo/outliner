import { describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "./ScrapboxFormatter";

describe("ScrapboxFormatter", () => {
    describe("bold", () => {
        it("should format text as bold", () => {
            expect(ScrapboxFormatter.bold("text")).toBe("[[text]]");
        });

        it("should remove bold formatting if already bold", () => {
            expect(ScrapboxFormatter.bold("[[text]]")).toBe("text");
        });
    });

    describe("italic", () => {
        it("should format text as italic", () => {
            expect(ScrapboxFormatter.italic("text")).toBe("[/text]");
        });

        it("should remove italic formatting if already italic", () => {
            expect(ScrapboxFormatter.italic("[/text]")).toBe("text");
        });
    });

    describe("strikethrough", () => {
        it("should format text with strikethrough", () => {
            expect(ScrapboxFormatter.strikethrough("text")).toBe("[-text]");
        });

        it("should remove strikethrough formatting if already strikethrough", () => {
            expect(ScrapboxFormatter.strikethrough("[-text]")).toBe("text");
        });
    });

    describe("code", () => {
        it("should format text as code", () => {
            expect(ScrapboxFormatter.code("text")).toBe("`text`");
        });

        it("should remove code formatting if already code", () => {
            expect(ScrapboxFormatter.code("`text`")).toBe("text");
        });
    });

    describe("getFormatType", () => {
        it("should detect bold format", () => {
            expect(ScrapboxFormatter.getFormatType("[[text]]")).toBe("bold");
        });

        it("should detect italic format", () => {
            expect(ScrapboxFormatter.getFormatType("[/text]")).toBe("italic");
        });

        it("should detect strikethrough format", () => {
            expect(ScrapboxFormatter.getFormatType("[-text]")).toBe("strikethrough");
        });

        it("should detect code format", () => {
            expect(ScrapboxFormatter.getFormatType("`text`")).toBe("code");
        });

        it("should return null for unformatted text", () => {
            expect(ScrapboxFormatter.getFormatType("text")).toBe(null);
        });
    });
});
