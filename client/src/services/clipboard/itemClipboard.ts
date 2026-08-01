export const OUTLINER_ITEMS_MIME = "application/x-outliner-items";

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
    items: Array<{ item: ItemLike; depth: number; fallbackText?: string; }>,
): string {
    const serialized = items.map(({ item, depth, fallbackText }) => {
        const value = nodeValue(item);
        const rawType = value?.get?.("componentType");
        const componentType = rawType === "yjstable" || rawType === "calendar" ? rawType : undefined;
        const bindingField = componentType ? bindings[componentType] : undefined;
        const binding = bindingField ? value?.get?.(bindingField) : undefined;
        const text = String(item.text ?? "") || fallbackText || "";
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
