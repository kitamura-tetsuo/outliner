import type { Item } from "../schema/app-schema";
import { iterateItems } from "./itemTraversal";
import { safeDecodeURIComponent } from "./urlUtils";

export function findPageByName(items: Iterable<Item> | undefined | null, name: string): Item | null {
    if (!items) return null;

    const decodedName = safeDecodeURIComponent(name);

    const targetNameRaw = String(name).trim().toLowerCase();
    const targetNameDecoded = String(decodedName).trim().toLowerCase();

    for (const p of iterateItems(items) as Iterable<Item>) {
        if (!p) continue;
        let textString: string;
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
