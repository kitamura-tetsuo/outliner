import type { Item } from "../schema/app-schema";
import { iterateItems } from "./itemTraversal";
import { safeDecodeURIComponent } from "./urlUtils";

export function generateDefaultPageTitle(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `New Page ${dateStr} ${timeStr}`;
}

export function findPageByName(items: Iterable<Item> | undefined | null, name: string): Item | null {
    if (!items) return null;

    const decodedName = safeDecodeURIComponent(name);

    const targetNameRaw = String(name).trim().toLowerCase();
    const targetNameDecoded = String(decodedName).trim().toLowerCase();
    let targetNameDecoded2 = targetNameRaw;
    try {
        targetNameDecoded2 = decodeURIComponent(String(name).trim()).toLowerCase();
    } catch {}

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

        if (currentName === targetNameRaw || currentName === targetNameDecoded || currentName === targetNameDecoded2) {
            return p;
        }
    }

    return null;
}
