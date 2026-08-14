import type { ItemClipboardPayload } from "./itemClipboard";

export type PasteSpecialVariant = "another-view" | "copy-with-data" | "copy-without-data" | "values-only";

export interface PasteSpecialChoice {
    variant: PasteSpecialVariant;
    label: string;
    description: string;
    available: boolean;
    reason?: string;
    isDefault: boolean;
}

export const PASTE_SPECIAL_REQUEST_EVENT = "paste-special-request";

export interface PasteSpecialRequest {
    choices: PasteSpecialChoice[];
    resolve: (variant: PasteSpecialVariant | undefined) => void;
}

export function pasteSpecialChoices(
    payload: ItemClipboardPayload,
    destinationProjectId: string,
): PasteSpecialChoice[] {
    const sameProject = payload.sourceProjectId === destinationProjectId;
    const hasPortableStructure = payload.version !== 1
        && (Object.keys(payload.tables ?? {}).length > 0
            || ("calendars" in payload && Object.keys(payload.calendars ?? {}).length > 0));
    const structureReason = hasPortableStructure
        ? undefined
        : "The clipboard does not contain portable component structure";

    return [
        {
            variant: "another-view",
            label: "Another view",
            description: "Create a second host backed by the same component data.",
            available: sameProject,
            reason: sameProject ? undefined : "The source component belongs to another project",
            isDefault: sameProject,
        },
        {
            variant: "copy-with-data",
            label: "Independent copy with data",
            description: "Create fresh component storage and copy its current data once.",
            available: hasPortableStructure,
            reason: structureReason,
            isDefault: !sameProject,
        },
        {
            variant: "copy-without-data",
            label: "Independent copy, no data",
            description: "Create fresh component storage from the schema and view settings only.",
            available: hasPortableStructure,
            reason: structureReason,
            isDefault: false,
        },
        {
            variant: "values-only",
            label: "Values only",
            description: "Paste the visible result as plain items and text, with no component binding.",
            available: true,
            isDefault: false,
        },
    ];
}

export function requestPasteSpecialChoice(choices: PasteSpecialChoice[]): Promise<PasteSpecialVariant | undefined> {
    if (typeof window === "undefined") return Promise.resolve(undefined);
    return new Promise(resolve => {
        window.dispatchEvent(
            new CustomEvent<PasteSpecialRequest>(PASTE_SPECIAL_REQUEST_EVENT, { detail: { choices, resolve } }),
        );
    });
}
