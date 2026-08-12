import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test: typing "/" at the end of an item used to swallow the
 * character right before the slash ("alpha" + "/data" became "alph/data").
 *
 * `KeyEventHandler.handleInput` runs *before* the slash reaches the model
 * (`cursor.onInput` is called later in the same handler), so the palette must
 * record the pre-insert cursor offset as the slash position. It used to pass
 * `isPostInsert = true`, which shifted `commandStartOffset` one character to
 * the left and made every later command keystroke rewrite the item text from
 * that wrong position.
 */

// Minimal fake item, mirroring the yjs-schema `Item` surface used by the palette.
const node = {
    text: "alpha",
    updateText(t: string) {
        node.text = t;
    },
};

// Fake cursor. `onInput` performs the model insert exactly like CursorEditor does.
const cursor = {
    itemId: "item1",
    offset: 5,
    userId: "local",
    findTarget: () => node,
    applyToStore: vi.fn(),
    onInput(event: InputEvent) {
        const data = event.data ?? "";
        if (!data) return;
        node.updateText(node.text.slice(0, cursor.offset) + data + node.text.slice(cursor.offset));
        cursor.offset += data.length;
    },
};

// Svelte store mock as permitted by AGENTS.md
vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        cursors: {},
        selections: {},
        isComposing: false,
        getLocalCursorInstances: () => [cursor],
        getCursorInstances: () => [cursor],
        getTextareaRef: () => undefined,
        triggerOnEdit: vi.fn(),
        startCursorBlink: vi.fn(),
        logCursorState: vi.fn(),
        setActiveItem: vi.fn(),
        clearCursorAndSelection: vi.fn(),
        setCompositionLength: vi.fn(),
    },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: { isVisible: false, hide: vi.fn(), show: vi.fn() },
}));

const insertedItem = { id: "item2", text: "", updateText: vi.fn(), key: undefined };
vi.mock("../utils/itemUtils", () => ({
    insertItemAfterTargetOrAppend: vi.fn(() => insertedItem),
}));

const { commandPaletteStore } = await import("../stores/CommandPaletteStore.svelte");
const { KeyEventHandler } = await import("./KeyEventHandler");

// handleInput both opens the palette and applies the slash to the model,
// exactly as it does for a real keystroke.
const typeSlash = () => {
    KeyEventHandler.handleInput(new InputEvent("input", { data: "/", inputType: "insertText" }));
};

describe("KeyEventHandler slash command palette", () => {
    beforeEach(() => {
        commandPaletteStore.hide();
        node.text = "alpha";
        cursor.offset = 5;
        cursor.itemId = "item1";
        vi.clearAllMocks();
    });

    it("keeps the character before the slash when the palette opens at the end of an item", () => {
        typeSlash();

        expect(commandPaletteStore.isVisible).toBe(true);
        expect(node.text).toBe("alpha/");
        expect(cursor.offset).toBe(6);
    });

    it("accumulates the command after the slash without eating preceding text", () => {
        typeSlash();

        for (const ch of "data") {
            commandPaletteStore.handleCommandInput(ch);
        }

        expect(node.text).toBe("alpha/data");
        expect(commandPaletteStore.query).toBe("data");
        expect(cursor.offset).toBe(10);
    });

    it("restores the original text when the command string is removed on insert", () => {
        typeSlash();
        for (const ch of "data") {
            commandPaletteStore.handleCommandInput(ch);
        }

        commandPaletteStore.insert("yjstable");

        expect(node.text).toBe("alpha");
    });

    it("matches the offsets handleKeyDown recorded for the same slash", () => {
        // handleKeyDown opens the palette before the input event fires, with the
        // same pre-insert offset, so re-recording it must be a no-op.
        commandPaletteStore.show({ top: 0, left: 0 }, false);
        typeSlash();

        commandPaletteStore.handleCommandInput("d");

        expect(node.text).toBe("alpha/d");
    });

    it("rebinds to the current cursor when the palette was left open elsewhere", () => {
        // A palette still visible from another item holds offsets that do not
        // belong to this slash; the input event must re-record them.
        cursor.itemId = "stale-item";
        cursor.offset = 2;
        commandPaletteStore.show({ top: 0, left: 0 }, false);

        cursor.itemId = "item1";
        cursor.offset = 5;
        typeSlash();

        expect(node.text).toBe("alpha/");
        commandPaletteStore.handleCommandInput("d");
        expect(node.text).toBe("alpha/d");
    });

    it("evaluates visible options once and uses the exact same array object for rendering and event handling", () => {
        typeSlash();
        commandPaletteStore.handleCommandInput("d");

        // Grab the instance returned by visible
        const firstVisibleList = commandPaletteStore.visible;
        // Verify it returns exactly the same array identity (which implies it's using the same getter)
        const secondVisibleList = commandPaletteStore.visible;

        expect(firstVisibleList).toBe(secondVisibleList);

        // A query change generates a new array, but it should still be internally consistent
        commandPaletteStore.handleCommandInput("a");
        const nextVisibleList = commandPaletteStore.visible;

        expect(nextVisibleList).not.toBe(firstVisibleList);
        expect(nextVisibleList).toBe(commandPaletteStore.visible);
    });
});
