import { expect, type Page } from "@playwright/test";
import { TestHelpers } from "./testHelpers";
import { TreeValidator } from "./treeValidation";

/**
 * Helpers for the shared input proxy (`textarea.global-textarea`) wrapping-policy
 * regressions (#5501). Composition goes through Chromium's real IME pipeline (CDP), so
 * the browser itself fires compositionstart/update/end on the production textarea.
 */
export async function nativeIme(page: Page) {
    const client = await page.context().newCDPSession(page);
    return {
        compose: (text: string) =>
            client.send("Input.imeSetComposition", {
                text,
                selectionStart: text.length,
                selectionEnd: text.length,
            }),
        /** Confirms `text`, replacing the current composition. */
        commit: (text: string) => client.send("Input.insertText", { text }),
        /** An empty composition update cancels the composition (Blink InputMethodController). */
        cancel: () => client.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 }),
    };
}

/** Activates the item whose text is exactly `text` through an ordinary click and returns its id. */
export async function activateItemByText(page: Page, text: string): Promise<string> {
    const item = page.locator(".outliner-item").filter({
        has: page.locator(".item-text", { hasText: text }),
    }).last();
    await item.waitFor({ state: "visible" });
    const itemId = await item.getAttribute("data-item-id");
    expect(itemId).not.toBeNull();
    await item.locator(".item-content").click();
    await TestHelpers.waitForCursorVisible(page);
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("global-textarea") ?? false))
        .toBe(true);
    return itemId!;
}

export const itemText = (page: Page, itemId: string) =>
    page.evaluate((id) => {
        const el = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`);
        return el?.textContent ?? "";
    }, itemId);

/** Every item text stored in the canonical Yjs tree. */
export async function canonicalTexts(page: Page): Promise<string[]> {
    const tree = await TreeValidator.getTreeData(page);
    const texts: string[] = [];
    const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        const text = (node as { text?: unknown; }).text;
        if (typeof text === "string") texts.push(text);
        Object.values(node).forEach(walk);
    };
    walk(tree);
    return texts;
}

export interface ProxyLayout {
    wrap: string | null;
    focused: boolean;
    value: string;
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    /** Width the mirrored value would need on one line, in the textarea's own font. */
    contentWidth: number;
    /** Height of one rendered text row inside the textarea. */
    rowHeight: number;
    /** Text rows the textarea lays its value out on (soft-wrapped rows included). */
    rows: number;
}

/**
 * Measures the production textarea's real layout. `rows` is derived from the browser's own
 * scrollHeight, so it counts soft-wrapped rows; the value contains no newlines, so any row
 * beyond the first can only come from soft wrapping.
 */
export function readProxyLayout(page: Page): Promise<ProxyLayout> {
    return page.evaluate(() => {
        const ta = document.querySelector("textarea.global-textarea") as HTMLTextAreaElement;
        const style = getComputedStyle(ta);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const fontSize = parseFloat(style.fontSize) || 16;
        const lineHeight = parseFloat(style.lineHeight);
        const rowHeight = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.2;
        const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const rows = Math.max(1, Math.round((ta.scrollHeight - paddingY) / rowHeight));
        return {
            wrap: ta.getAttribute("wrap"),
            focused: document.activeElement === ta,
            value: ta.value,
            clientWidth: ta.clientWidth,
            clientHeight: ta.clientHeight,
            scrollWidth: ta.scrollWidth,
            scrollHeight: ta.scrollHeight,
            contentWidth: ctx.measureText(ta.value).width,
            rowHeight,
            rows,
        };
    });
}

/** Asserts the proxy is laid out on one row although its content is wider than the box. */
export function expectSingleRowOverflowing(layout: ProxyLayout) {
    expect(layout.wrap).toBe("off");
    expect(layout.value).not.toContain("\n");
    // The content genuinely exceeds the available width, so soft wrapping would be triggered...
    expect(layout.contentWidth).toBeGreaterThan(layout.clientWidth + layout.rowHeight);
    // ...yet the browser lays it out on a single row and overflows horizontally instead.
    expect(layout.rows).toBe(1);
    expect(layout.scrollWidth).toBeGreaterThan(layout.clientWidth);
}
