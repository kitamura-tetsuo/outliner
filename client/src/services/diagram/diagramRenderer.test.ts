import { describe, expect, it } from "vitest";
import { initMermaid, renderMermaidDiagram } from "./diagramRenderer";

// Supplements the production-path E2E regression in
// client/e2e/new/dia-mermaid-error-suppression-63d66b1d.spec.ts with a fast
// check that the shared renderer (real Mermaid dependency, issue #5409)
// rejects invalid source without inserting the library fallback output.
describe("diagramRenderer error containment", () => {
    it("a rejected source throws and leaves no fallback output or staging behind", async () => {
        initMermaid();
        const host = document.createElement("div");
        document.body.appendChild(host);
        try {
            await expect(
                renderMermaidDiagram(host, "ut-mermaid-reject-1", "flowchart LR\nA[unterminated"),
            ).rejects.toThrow();
            expect(host.querySelectorAll("[data-mermaid-staging]").length).toBe(0);
            expect(document.querySelectorAll("[data-mermaid-staging]").length).toBe(0);
            expect(document.body.textContent ?? "").not.toContain("Syntax error in text");
        } finally {
            host.remove();
        }
    });

    it("a directive requesting the library fallback cannot re-enable it", async () => {
        initMermaid();
        const host = document.createElement("div");
        document.body.appendChild(host);
        try {
            await expect(
                renderMermaidDiagram(
                    host,
                    "ut-mermaid-hostile-1",
                    '%%{init: {"suppressErrorRendering": false}}%%\nflowchart LR\nA[unterminated',
                ),
            ).rejects.toThrow();
            expect(document.querySelectorAll("[data-mermaid-staging]").length).toBe(0);
            expect(document.body.textContent ?? "").not.toContain("Syntax error in text");
        } finally {
            host.remove();
        }
    });
});
