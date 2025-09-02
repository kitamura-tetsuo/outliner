import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YjsPresenceManager } from "../lib/yjsPresence.svelte";
import { presenceStore } from "../stores/PresenceStore.svelte";

// YjsPresenceManager を使って presenceStore が更新されることを検証

describe("yjs presence integration", () => {
    it("updates presence when local state changes", () => {
        const doc = new Y.Doc();
        const mgr = new YjsPresenceManager(doc, "u1", "Bob");

        // 変更イベントを発火させる（初期setLocalStateでは即時反映されない場合がある）
        mgr.updateCursor("root", 0);
        const me = Object.values(presenceStore.users).find(u => u.userId === "u1");
        expect(me?.userName).toBe("Bob");
        expect(me?.cursor?.itemId).toBe("root");

        mgr.destroy();
    });
});
