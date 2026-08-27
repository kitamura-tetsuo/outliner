import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMCPGridTools } from "./WebMCP";

describe("registerWebMCPGridTools", () => {
    afterEach(() => {
        delete (window as { WebMCP?: unknown; }).WebMCP;
    });

    it("returns a no-op cleanup if WebMCP is not present on window", () => {
        const cleanup = registerWebMCPGridTools(() => undefined, () => undefined);
        expect(cleanup).toBeTypeOf("function");
        expect(() => cleanup()).not.toThrow();
    });

    it("registers tools and returns cleanup if WebMCP is present", async () => {
        const mockAddTool = vi.fn().mockImplementation(() => vi.fn());
        (window as { WebMCP?: { addTool: unknown; }; }).WebMCP = { addTool: mockAddTool };

        const getContext = vi.fn().mockReturnValue({ gridId: "g1", sourceTableId: "t1" });
        const getResult = vi.fn().mockReturnValue({
            gridId: "g1",
            sourceTableId: "t1",
            rows: [],
            columns: [],
            rowCount: 0,
        });

        const cleanup = registerWebMCPGridTools(getContext, getResult);

        expect(mockAddTool).toHaveBeenCalledTimes(2);

        const tools = mockAddTool.mock.calls.map(call => call[0].name);
        expect(tools).toContain("getCurrentGrid");
        expect(tools).toContain("getGridResult");

        // Verify getCurrentGrid handler
        const getCurrentGridConfig = mockAddTool.mock.calls.find(call => call[0].name === "getCurrentGrid")![0];
        const ctxResponse = await getCurrentGridConfig.handler();
        expect(ctxResponse.content[0].text).toContain("g1");

        // Verify getGridResult handler
        const getGridResultConfig = mockAddTool.mock.calls.find(call => call[0].name === "getGridResult")![0];
        const resResponse = await getGridResultConfig.handler();
        expect(resResponse.content[0].text).toContain("g1");

        // Verify cleanup
        cleanup();
        expect(mockAddTool.mock.results[0].value).toHaveBeenCalledTimes(1);
        expect(mockAddTool.mock.results[1].value).toHaveBeenCalledTimes(1);
    });
});
