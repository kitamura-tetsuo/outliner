import type { Page, TestInfo } from "@playwright/test";

/** Observe real gesture/DOM state for failure artifacts; never drive the preview. */
export async function observeResizeGesture(page: Page, info: TestInfo) {
    await page.evaluate(() => {
        const view = document.querySelector('[data-testid="yjs-table-view"]')!;
        const grid = view.querySelector<HTMLElement>('[data-testid="yjs-table-grid"]')!;
        const header = grid.querySelector<HTMLElement>('th[data-col="title"]')!;
        const input = view.querySelector<HTMLInputElement>('[data-testid="yjs-table-width-title"]')!;
        const registry = (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids");
        const gridId = view.getAttribute("data-grid-id");
        const entry = registry.get(gridId);
        const events: unknown[] = [];
        const capture = (kind: string, event?: Event) => {
            if (events.length >= 300) return;
            const box = grid.getBoundingClientRect();
            const clientX = event && "clientX" in event ? Number(event.clientX) : undefined;
            events.push({
                kind,
                time: performance.now(),
                clientX,
                contentX: clientX === undefined ? undefined : clientX - box.left + grid.scrollLeft,
                headerWidth: header.getBoundingClientRect().width,
                scroller: {
                    left: box.left,
                    width: box.width,
                    clientWidth: grid.clientWidth,
                    scrollWidth: grid.scrollWidth,
                    scrollLeft: grid.scrollLeft,
                },
                input: input.value,
                preview: input.getAttribute("data-width-preview"),
                active: grid.getAttribute("data-column-resizing"),
                connected: header.isConnected,
                sameEntry: registry.get(gridId) === entry,
                query: registry.get(gridId)?.get("query"),
            });
        };
        for (
            const kind of [
                "pointerdown",
                "pointermove",
                "pointerup",
                "pointercancel",
                "lostpointercapture",
                "blur",
                "keydown",
            ]
        ) {
            globalThis.addEventListener(kind, event => capture(kind, event), true);
        }
        grid.addEventListener("scroll", event => capture("scroll", event));
        const observer = new MutationObserver(() => capture("preview-or-layout"));
        observer.observe(view, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["style", "data-width-preview", "data-column-resizing"],
        });
        registry.observeDeep(() => capture("definition-change"));
        (globalThis as any).__resizeGestureDiagnostics = { events, capture };
        capture("installed");
    });
    return async (phase: string, plan?: unknown) => {
        const events = await page.evaluate(name => {
            const diagnostic = (globalThis as any).__resizeGestureDiagnostics;
            diagnostic.capture(name);
            return diagnostic.events;
        }, phase);
        const evidence = { phase, plan, events };
        await info.attach(`resize-gesture-${phase}`, {
            body: JSON.stringify(evidence),
            contentType: "application/json",
        });
        console.log(
            "[resize-gesture]",
            JSON.stringify({
                ...evidence,
                events: events.filter((event: any) =>
                    ["pointerdown", "pointercancel", "lostpointercapture", "blur", phase].includes(event.kind)
                ),
            }),
        );
    };
}
