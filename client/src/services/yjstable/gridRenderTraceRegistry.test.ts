import { afterEach, describe, expect, it } from "vitest";
import type { GridRenderTrace } from "./gridRenderTrace";
import { collectGridRenderTraces, registerGridRenderTraceSource } from "./gridRenderTraceRegistry";

function trace(gridId: string): GridRenderTrace {
    return {
        version: 1,
        gridId,
        sourceTableId: `${gridId}-table`,
        generatedAt: "2026-08-27T00:00:00.000Z",
        stages: [],
    };
}

describe("gridRenderTraceRegistry", () => {
    const unregisterFns: (() => void)[] = [];

    afterEach(() => {
        while (unregisterFns.length > 0) unregisterFns.pop()?.();
    });

    it("collects the current trace from every registered Grid", () => {
        unregisterFns.push(registerGridRenderTraceSource("grid-1", () => trace("grid-1")));
        unregisterFns.push(registerGridRenderTraceSource("grid-2", () => trace("grid-2")));

        const traces = collectGridRenderTraces();

        expect(traces.map(t => t.gridId).sort()).toEqual(["grid-1", "grid-2"]);
    });

    it("calls the getter lazily so it reflects the latest state, not a snapshot at registration time", () => {
        let revision = 1;
        unregisterFns.push(
            registerGridRenderTraceSource("grid-1", () => ({ ...trace("grid-1"), stages: [{ revision } as never] })),
        );

        revision = 2;
        const [first] = collectGridRenderTraces();

        expect((first.stages[0] as { revision: number; }).revision).toBe(2);
    });

    it("skips Grids whose getter has no trace yet", () => {
        unregisterFns.push(registerGridRenderTraceSource("grid-1", () => undefined));

        expect(collectGridRenderTraces()).toEqual([]);
    });

    it("stops returning a Grid's trace once it unregisters", () => {
        const unregister = registerGridRenderTraceSource("grid-1", () => trace("grid-1"));

        unregister();

        expect(collectGridRenderTraces()).toEqual([]);
    });

    it("replaces the source for a gridId when a second view registers for the same Grid", () => {
        registerGridRenderTraceSource("grid-1", () => trace("grid-1"));
        unregisterFns.push(
            registerGridRenderTraceSource("grid-1", () => ({ ...trace("grid-1"), sourceTableId: "replaced" })),
        );

        const [only] = collectGridRenderTraces();

        expect(only.sourceTableId).toBe("replaced");
    });

    it("a stale unregister call does not remove a source that was since replaced", () => {
        const staleUnregister = registerGridRenderTraceSource("grid-1", () => trace("grid-1"));
        unregisterFns.push(
            registerGridRenderTraceSource("grid-1", () => ({ ...trace("grid-1"), sourceTableId: "fresh" })),
        );

        staleUnregister();

        const [only] = collectGridRenderTraces();
        expect(only.sourceTableId).toBe("fresh");
    });

    it("exposes the registry on window so Playwright's page.evaluate() can reach it", () => {
        expect(window.__outlinerGridRenderTraces?.collect).toBeTypeOf("function");

        unregisterFns.push(registerGridRenderTraceSource("grid-1", () => trace("grid-1")));

        expect(window.__outlinerGridRenderTraces?.collect().map(t => t.gridId)).toEqual(["grid-1"]);
    });
});
