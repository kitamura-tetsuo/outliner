import { describe, expect, it } from "vitest";
import { store as globalStore } from "../../stores/globalStore.svelte";

// Fluid依存を廃止: globalStore 経由の派生値が単純に参照できることのみ検証

describe("GlobalStore integration (Yjs backend)", () => {
    it("exposes connection state flag without throwing", () => {
        // isConnected は派生値。存在確認のみ行い、具体値はBackendに依存しない
        expect(typeof globalStore.isConnected).toBe("boolean");
    });
});
