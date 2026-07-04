const fs = require("fs");
const file = "client/src/lib/KeyEventHandler.ts";
let code = fs.readFileSync(file, "utf8");

// 1. Remove Alias Picker forward block
const m1 = code.match(
    /        \/\/ While Alias Picker is visible: forward Arrow\/Enter\/Escape to the picker\n        try \{\n            if \(aliasPickerStore\.isVisible\) \{[\s\S]*?            \}\n        \} catch \{\}\n/,
);
if (m1) {
    code = code.replace(m1[0], "");
}

// 2. Delete DOM query click and test fallback branch in KeyEventHandler.handleKeyDown (Enter key)
const match1 = code.match(/\/\/ Use the 2nd item in the list[\s\S]*?\} catch \{\}\n                        \}\n/);
if (match1) {
    code = code.replace(match1[0], "");
}

// 3. Delete gs.__lastInputStream logic in handleInput
const match2 = code.match(
    /        \/\/ Buffer the latest input stream \(for fallback detection of palette\)[\s\S]*?        \} catch \{\}\n/,
);
if (match2) {
    code = code.replace(match2[0], "");
}

// 4. Add Command Palette logic and Slash command logic at the top of handleKeyDown
const m2 = code.indexOf("        if (isForeignInput(event.target) || isForeignInput(document.activeElement)) return;");
if (m2 !== -1) {
    const insertStr = `
        const k = (event as KeyboardEvent).key;

        // Command Palette Interaction
        if (commandPaletteStore.isVisible) {
            if (!event.ctrlKey && !event.metaKey && !event.altKey && k.length === 1 && k !== "/") {
                commandPaletteStore.inputLight(k);
                event.preventDefault();
                return;
            }
            if (k === "Backspace") {
                commandPaletteStore.backspaceLight();
                event.preventDefault();
                return;
            }
            if (k === "Enter") {
                const list = commandPaletteStore.filtered ?? [];
                const sel = list?.[commandPaletteStore.selectedIndex ?? 0];
                const q = String(commandPaletteStore.query || "").toLowerCase();
                const isAliasOnly = Array.isArray(list) && list.length === 1 && (list[0]?.type === "alias");
                const looksAlias = q === "alias" || /^(?:al|ali|alia|alias)$/.test(q);

                let textSaysAlias = false;
                try {
                    const ta: HTMLTextAreaElement | null | undefined = window.generalStore?.textareaRef;
                    if (ta && typeof ta.value === "string") {
                        const before = ta.value.slice(0, typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length);
                        textSaysAlias = /\\/(?:al|ali|alia|alias)$/i.test(before);
                    }
                } catch {}

                if (isAliasOnly || looksAlias || textSaysAlias) {
                    try { if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("KeyEventHandler: palette Enter forcing alias insert (q=", q, ", textSaysAlias=", textSaysAlias, ")"); } catch {}
                    commandPaletteStore.insert("alias");
                    commandPaletteStore.hide();
                    event.preventDefault();
                    return;
                }
                // Otherwise normal confirmation
                if (sel) {
                    commandPaletteStore.confirm();
                    event.preventDefault();
                    return;
                }

                commandPaletteStore.confirm();
                event.preventDefault();
                return;
            }
            if (k === "ArrowDown") {
                commandPaletteStore.move(1);
                event.preventDefault();
                return;
            }
            if (k === "ArrowUp") {
                commandPaletteStore.move(-1);
                event.preventDefault();
                return;
            }
        }

        // Palette Activation via Slash
        if (k === "/") {
            // Context verification: prevent opening immediately after [ or inside internal links
            let shouldShow = true;
            try {
                const cursors = store.getCursorInstances();
                if (cursors.length > 0) {
                    const cursor = cursors[0];
                    const node = cursor.findTarget();
                    const text = String(node?.text || "");
                    const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                    if (prevChar === "[") {
                        shouldShow = false;
                    } else {
                        const beforeCursor = text.slice(0, cursor.offset);
                        const lastOpenBracket = beforeCursor.lastIndexOf("[");
                        const lastCloseBracket = beforeCursor.lastIndexOf("]");
                        if (lastOpenBracket > lastCloseBracket) {
                            shouldShow = false;
                        }
                    }
                }
            } catch {}

            if (shouldShow && !commandPaletteStore.isVisible) {
                try {
                    const pos = commandPaletteStore.getCursorScreenPosition();
                    commandPaletteStore.show(pos || { top: 0, left: 0 });
                } catch {}
            }
        }
`;
    // Insert after the isForeignInput check to correctly skip native inputs
    code = code.substring(0, m2 + 91) + insertStr + code.substring(m2 + 91);
}

// Fix duplicated code problem
const m4 = code.match(
    /                                    \} catch \{\}\n                                \}\n                            \} catch \{\}\n                        \}\n/,
);
if (m4) {
    code = code.replace(
        m4[0],
        "                                    } catch {}\n                                }\n                            } catch {}\n                        }\n",
    );
}

const s1 = code.indexOf("                        // Use the 2nd item in the list");
const e1 = code.indexOf(
    "                    } catch {\n                        aliasPickerStore.hide();\n                    }",
);

if (s1 !== -1 && e1 !== -1) {
    code = code.substring(0, s1) + code.substring(e1);
}

fs.writeFileSync(file, code);
