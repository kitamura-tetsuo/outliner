import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import FormatDisplay from "../fixtures/FormatDisplay.svelte";

describe("link formatting integration", () => {
    it("converts [URL label] into anchor with label text", async () => {
        render(FormatDisplay, { text: "Check [https://example.com Example Site]" });
        await tick();
        const html = screen.getByTestId("html").innerHTML;
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain(">Example Site<");
    });
});
