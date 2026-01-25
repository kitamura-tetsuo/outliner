// Custom keyboard shortcut map
// Customize key bindings

import { getLogger } from "./logger";

const logger = getLogger("CustomKeyMap");

export interface KeyBinding {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    command: string;
}

export class CustomKeyMap {
    private bindings: KeyBinding[] = [];

    constructor() {
        // Default settings
        this.addBinding({ key: "Enter", command: "newItem" });
        this.addBinding({ key: "Tab", command: "indent" });
        this.addBinding({ key: "Tab", shift: true, command: "unindent" });
        this.addBinding({ key: "ArrowUp", command: "moveUp" });
        this.addBinding({ key: "ArrowDown", command: "moveDown" });
        this.addBinding({ key: "ArrowLeft", command: "moveLeft" });
        this.addBinding({ key: "ArrowRight", command: "moveRight" });
        this.addBinding({ key: "Backspace", command: "deleteItem" });

        // Add more default shortcuts...
    }

    addBinding(binding: KeyBinding) {
        this.bindings.push(binding);
    }

    getCommand(event: KeyboardEvent): string | null {
        // Find matching binding
        const match = this.bindings.find(b =>
            b.key.toLowerCase() === event.key.toLowerCase()
            && !!b.ctrl === (event.ctrlKey || event.metaKey) // Treat Ctrl/Meta (Command) same
            && !!b.shift === event.shiftKey
            && !!b.alt === event.altKey
        );

        if (match) {
            logger.debug(`Key matched: ${event.key} -> ${match.command}`);
            return match.command;
        }

        return null;
    }
}

export const keyMap = new CustomKeyMap();
