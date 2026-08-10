export const OUTLINER_ITEMS_MIME = "application/x-outliner-items";
const OUTLINER_ITEMS_HTML_ATTRIBUTE = "data-outliner-items";

export type ClipboardComponentType = "yjstable" | "calendar";

export interface ClipboardItem {
    text: string;
    depth: number;
    componentType?: ClipboardComponentType;
    yjsTableId?: string;
    calendarId?: string;
}

export interface ItemClipboardPayload {
    version: 1;
    sourceProjectId: string;
    items: ClipboardItem[];
}

interface ItemLike {
    text?: unknown;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

const bindings = {
    yjstable: "yjsTableId",
    calendar: "calendarId",
} as const;

function nodeValue(item: ItemLike): { get?: (key: string) => unknown; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as { get?: (key: string) => unknown; };
    } catch {
        return undefined;
    }
}

export function serializeClipboardItems(
    sourceProjectId: string,
    // `text` overrides the item's own text, so a partially selected item can be
    // copied as just the selected slice while keeping its position in the range.
    items: Array<{ item: ItemLike; depth: number; fallbackText?: string; text?: string; }>,
): string {
    const serialized = items.map(({ item, depth, fallbackText, text: textOverride }) => {
        const value = nodeValue(item);
        const rawType = value?.get?.("componentType");
        const componentType = rawType === "yjstable" || rawType === "calendar" ? rawType : undefined;
        const bindingField = componentType ? bindings[componentType] : undefined;
        const binding = bindingField ? value?.get?.(bindingField) : undefined;
        const text = (textOverride ?? String(item.text ?? "")) || fallbackText || "";
        return {
            text,
            depth,
            ...(componentType && typeof binding === "string" && binding.length > 0
                ? { componentType, [bindingField!]: binding }
                : {}),
        } as ClipboardItem;
    });
    return JSON.stringify({ version: 1, sourceProjectId, items: serialized } satisfies ItemClipboardPayload);
}

export function deserializeClipboardItems(value: string): ItemClipboardPayload | undefined {
    try {
        const payload = JSON.parse(value) as Partial<ItemClipboardPayload>;
        if (payload.version !== 1 || typeof payload.sourceProjectId !== "string" || !Array.isArray(payload.items)) {
            return undefined;
        }
        if (payload.items.some(item => typeof item?.text !== "string" || typeof item?.depth !== "number")) {
            return undefined;
        }
        return payload as ItemClipboardPayload;
    } catch {
        return undefined;
    }
}

export function clipboardPlainText(payload: ItemClipboardPayload): string {
    return payload.items.map(item => item.text).join("\n");
}

export function structuredClipboardHtml(encoded: string, plainText: string): string {
    const bytes = new TextEncoder().encode(encoded);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const visibleText = plainText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("\n", "<br>");
    return `<span ${OUTLINER_ITEMS_HTML_ATTRIBUTE}="${btoa(binary)}" hidden></span><span>${visibleText}</span>`;
}

export function structuredClipboardFromHtml(html: string): string | undefined {
    if (!html) return undefined;
    const document = new DOMParser().parseFromString(html, "text/html");
    const encoded = document.querySelector(`[${OUTLINER_ITEMS_HTML_ATTRIBUTE}]`)?.getAttribute(
        OUTLINER_ITEMS_HTML_ATTRIBUTE,
    );
    if (!encoded) return undefined;
    try {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return undefined;
    }
}
