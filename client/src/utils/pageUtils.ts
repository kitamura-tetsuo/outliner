import type { Item } from "../schema/app-schema";
import { iterateItems } from "./itemTraversal";

export function findPageByName(items: any | undefined | null, name: string): Item | null {
    if (!items) return null;

    let decodedName = name;
    try {
        decodedName = decodeURIComponent(name);
    } catch (_e) {
        // ignore URI malformed error
    }

    const targetNameRaw = String(name).trim().toLowerCase();
    const targetNameDecoded = String(decodedName).trim().toLowerCase();

    for (const p of iterateItems(items) as Iterable<Item>) {
        if (!p) continue;
        let textString = "";
        try {
            if (typeof p.text?.toString === "function") {
                textString = p.text.toString();
            } else {
                textString = String(p.text ?? "");
            }
        } catch (_e) {
            textString = "";
        }

        const currentName = textString.trim().toLowerCase();

        if (currentName === targetNameRaw || currentName === targetNameDecoded) {
            return p;
        }
    }

    return null;
}
