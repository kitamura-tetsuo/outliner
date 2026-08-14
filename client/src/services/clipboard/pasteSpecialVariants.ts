import type * as Y from "yjs";
import { type ItemClipboardPayloadV3 } from "./itemClipboard";

export type PasteSpecialVariant =
    | "another-view"
    | "independent-copy-with-data"
    | "independent-copy-no-data"
    | "values-only";

export interface PasteSpecialAvailability {
    variant: PasteSpecialVariant;
    label: string;
    description?: string;
    available: boolean;
    reason?: string;
}

export function computePasteSpecialVariants(
    structuredItems: ItemClipboardPayloadV3 | undefined | null,
    destinationDoc: Y.Doc | null,
): PasteSpecialAvailability[] {
    const isSameProject = structuredItems && destinationDoc
        ? structuredItems.sourceProjectId === destinationDoc.guid
        : false;

    // Check if the payload contains tables
    const hasTables = structuredItems && structuredItems.items.some(
        item => item.componentType === "yjstable" && item.yjsTableId,
    );

    if (!hasTables) {
        // If there are no tables, these specific variant options might not all make sense
        // or we just return "Values only"
        return [
            {
                variant: "values-only",
                label: "Values only",
                available: true,
            },
        ];
    }

    const variants: PasteSpecialAvailability[] = [];

    // "Another view"
    if (isSameProject) {
        variants.push({
            variant: "another-view",
            label: "Another view",
            available: true,
        });
    } else {
        variants.push({
            variant: "another-view",
            label: "Another view",
            available: false,
            reason: "Another view — the source table belongs to another project",
        });
    }

    // "Independent copy with data"
    variants.push({
        variant: "independent-copy-with-data",
        label: "Independent copy with data",
        available: true,
    });

    // "Independent copy, no data"
    variants.push({
        variant: "independent-copy-no-data",
        label: "Independent copy, no data",
        available: true,
    });

    // "Values only"
    variants.push({
        variant: "values-only",
        label: "Values only",
        available: true,
    });

    return variants;
}
