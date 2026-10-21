import type { Page } from "@playwright/test";

/** Compare every available system clipboard flavor byte-for-byte after refusal. */
export async function readClipboardBytes(page: Page) {
    await page.bringToFront();
    return page.evaluate(async () =>
        Promise.all((await navigator.clipboard.read()).map(async item => ({
            types: item.types,
            data: await Promise.all(
                item.types.map(async type =>
                    Array.from(new Uint8Array(await (await item.getType(type)).arrayBuffer()))
                ),
            ),
        })))
    );
}
