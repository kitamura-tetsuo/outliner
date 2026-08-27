export interface WebMCPGridContext {
    gridId: string;
    sourceTableId: string;
    query?: string;
}

export interface WebMCPGridResult {
    gridId: string;
    sourceTableId: string;
    rows: readonly Record<string, unknown>[];
    columns: readonly string[];
    rowCount: number;
}

/**
 * Registers WebMCP tools for the browser-local Grid context.
 */
export function registerWebMCPGridTools(
    getGridContext: () => WebMCPGridContext | undefined,
    getGridResult: () => WebMCPGridResult | undefined,
): () => void {
    if (typeof window === "undefined") {
        return () => {}; // SSR or non-browser environment
    }

    const mcp = (window as { WebMCP?: { addTool?: (config: unknown) => () => void; }; }).WebMCP;
    if (!mcp || typeof mcp.addTool !== "function") {
        return () => {}; // Browser without WebMCP capability
    }

    // Tool 1: getCurrentGrid
    const removeGetCurrentGrid = mcp.addTool({
        name: "getCurrentGrid",
        description: "Return the Grid currently being viewed/targeted by the user.",
        schema: {
            type: "object",
            properties: {},
        },
        handler: async () => {
            const ctx = getGridContext();
            if (!ctx) {
                return {
                    content: [{ type: "text", text: "No Grid currently in focus." }],
                };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }],
            };
        },
    });

    // Tool 2: getGridResult
    const removeGetGridResult = mcp.addTool({
        name: "getGridResult",
        description: "Return the Grid result as observed by the frontend for the current Grid.",
        schema: {
            type: "object",
            properties: {},
        },
        handler: async () => {
            const res = getGridResult();
            if (!res) {
                return {
                    content: [{ type: "text", text: "No Grid result currently available." }],
                };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
            };
        },
    });

    return () => {
        if (typeof removeGetCurrentGrid === "function") removeGetCurrentGrid();
        if (typeof removeGetGridResult === "function") removeGetGridResult();
    };
}
