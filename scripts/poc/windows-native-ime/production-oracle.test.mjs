import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOutcome, expectedOutcome } from "./production-oracle.mjs";
const before = {
    sessionId: "page-a",
    action: "dual-confirm",
    documentGuid: "doc-a",
    compositionId: 0,
    items: [{ id: "a", canonical: "prefixsuffix", rendered: "prefixsuffix" }, {
        id: "b",
        canonical: "lefttail",
        rendered: "lefttail",
    }, { id: "c", canonical: "untouched", rendered: "untouched" }],
    cursors: [{ cursorId: "one", itemId: "a", offset: 6, userId: "local", isActive: true }, {
        cursorId: "two",
        itemId: "b",
        offset: 4,
        userId: "local",
        isActive: true,
    }],
    selections: [],
};
function after(candidate, cancel = false) {
    return {
        ...before,
        ...expectedOutcome(before, candidate, cancel),
        compositionId: 1,
        composing: false,
        focused: true,
        documentFocused: true,
        wrap: "off",
        events: [{
            type: "compositionend",
            trusted: true,
            compositionId: 1,
            sessionId: before.sessionId,
            action: before.action,
            data: cancel ? "" : candidate,
        }],
    };
}
test("independent baseline + actual astral candidate; exact UTF-16 logical offsets", () => {
    const observed = after("🗾");
    assert.deepEqual(observed.items.map(i => i.canonical), ["prefix🗾suffix", "left🗾tail", "untouched"]);
    assert.deepEqual(observed.cursors.map(c => c.offset), [8, 6]);
    assertOutcome(before, observed, "🗾");
});
test("exact oracle rejects document/cursor/session/native agreement mutations", () => {
    for (
        const mutate of [
            s => s.items[0].canonical = "prefixsuffix",
            s => s.items[0].canonical = "prefix日本日本suffix",
            s => s.items[1].canonical = "lefttail",
            s => s.items[2].canonical = "untouched日本",
            s => s.cursors.pop(),
            s => s.cursors.push({ ...s.cursors[0], cursorId: "extra" }),
            s => s.cursors[0].offset = 6,
            s => s.cursors[0].cursorId = "replacement",
            s => s.sessionId = "new-page",
            s => s.action = "another-action",
            s => s.events[0].compositionId = 0,
            s => s.events[0].data = "二本",
            s => s.items[0].rendered = "prefixsuffix",
        ]
    ) {
        const observed = structuredClone(after("日本"));
        mutate(observed);
        assert.throws(() => assertOutcome(before, observed, "日本"));
    }
});
test("cancellation preserves exact cursor identities, offsets and selections", () => {
    assertOutcome(before, after("二本", true), "二本", true);
    const wrong = after("二本", true);
    wrong.cursors[1].offset++;
    assert.throws(() => assertOutcome(before, wrong, "二本", true));
});
