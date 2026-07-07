import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item } from "./app-schema";

describe("Item Attachment URL Validation", () => {
    it("should allow https URLs", () => {
        const doc = new Y.Doc();
        const map = doc.getMap();
        // @ts-expect-error: We use Y.Map directly for tests
        const item = new Item(map);
        expect(() => {
            item.addAttachment("https://example.com/image.png");
        }).not.toThrow();
        expect(item.attachments.length).toBe(1);
    });

    it("should reject blob: URLs in non-E2E mode", () => {
        const doc = new Y.Doc();
        const map = doc.getMap();
        // @ts-expect-error: We use Y.Map directly for tests
        const item = new Item(map);
        expect(() => {
            item.addAttachment("blob:http://localhost/uuid-1234");
        }).toThrow("Invalid attachment URL");
    });

    it("should reject data: URLs in non-E2E mode", () => {
        const doc = new Y.Doc();
        const map = doc.getMap();
        // @ts-expect-error: We use Y.Map directly for tests
        const item = new Item(map);
        expect(() => {
            item.addAttachment("data:image/png;base64,iVBORw0KGgo");
        }).toThrow("Invalid attachment URL");
    });

    it("should allow blob: URLs in E2E mode", () => {
        const doc = new Y.Doc();
        const map = doc.getMap();
        // @ts-expect-error: We use Y.Map directly for tests
        const item = new Item(map);

        // Mock E2E mode
        globalThis.window = { __E2E__: true } as Window & typeof globalThis & { __E2E__?: boolean; };

        expect(() => {
            item.addAttachment("blob:http://localhost/uuid-1234");
        }).not.toThrow();
        expect(item.attachments.length).toBe(1);

        // Cleanup
        delete (globalThis as Omit<typeof globalThis, 'window'> & { window?: unknown }).window;
    });
});
