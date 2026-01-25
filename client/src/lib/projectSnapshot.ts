import * as Y from "yjs";
import { getLogger } from "./logger";

const logger = getLogger("projectSnapshot");

/**
 * Serialize Y.Doc to JSON object
 * @param doc Y.Doc instance
 * @returns Serialized JSON object
 */
export function serializeYDoc(doc: Y.Doc): Record<string, any> {
    const result: Record<string, any> = {};

    try {
        // Serialize share types
        doc.share.forEach((item, key) => {
            if (item instanceof Y.Map) {
                result[key] = item.toJSON();
            } else if (item instanceof Y.Array) {
                result[key] = item.toJSON();
            } else if (item instanceof Y.Text) {
                result[key] = item.toString();
            } else if (item instanceof Y.XmlFragment) {
                // Simplified XML representation (if needed)
                result[key] = item.toString();
            }
        });
    } catch (error) {
        logger.error("Error serializing Y.Doc:", error);
    }

    return result;
}

/**
 * Apply JSON object to Y.Doc
 * @param doc Y.Doc instance
 * @param data Serialized JSON object
 */
export function applySnapshot(doc: Y.Doc, data: Record<string, any>) {
    try {
        doc.transact(() => {
            for (const [key, value] of Object.entries(data)) {
                if (Array.isArray(value)) {
                    const yarray = doc.getArray(key);
                    yarray.delete(0, yarray.length);
                    yarray.push(value);
                } else if (typeof value === "object" && value !== null) {
                    const ymap = doc.getMap(key);
                    for (const [k, v] of Object.entries(value)) {
                        ymap.set(k, v);
                    }
                } else if (typeof value === "string") {
                    const ytext = doc.getText(key);
                    ytext.delete(0, ytext.length);
                    ytext.insert(0, value);
                }
            }
        });
    } catch (error) {
        logger.error("Error applying snapshot:", error);
    }
}
