// Mapping from UI Definition component types (and schema column kinds) to
// the Svelte cell components rendered inside the dynamic grid.

import type { Component } from "svelte";
import type { GridNavDirection } from "../../services/yjstable/gridKeyboardNav";
import type { TableColumnSchema } from "../../services/yjstable/schemaIntrospection";
import CheckboxCell from "./cells/CheckboxCell.svelte";
import DateCell from "./cells/DateCell.svelte";
import NumberCell from "./cells/NumberCell.svelte";
import SelectCell from "./cells/SelectCell.svelte";
import TextCell from "./cells/TextCell.svelte";

export interface CellProps {
    value: unknown;
    editable: boolean;
    options?: string[];
    ariaLabel?: string;
    /**
     * Whether this cell is the one active editor. Bindable on text/number
     * cells (the only ones with a separate navigation-mode "view" state):
     * Grid flips it to start editing from the keyboard, and reads it back
     * when the cell's own click/blur/Enter/Escape handling ends the session.
     * Unused by select/date/checkbox, which have no such toggle.
     */
    editing?: boolean;
    /** Initial text for an edit started by typing a printable character in Grid navigation mode. */
    editSeed?: string;
    onCommit: (value: string | number | boolean | null) => void;
    /** Grid navigation move after a keyboard commit/cancel; omitted means "stay on this cell". */
    onRequestFocus?: (direction?: GridNavDirection) => void;
}

export type CellComponentType = "text" | "number" | "checkbox" | "select" | "date";

const CELL_COMPONENTS: Record<CellComponentType, Component<CellProps>> = {
    text: TextCell as Component<CellProps>,
    number: NumberCell as Component<CellProps>,
    checkbox: CheckboxCell as Component<CellProps>,
    select: SelectCell as Component<CellProps>,
    date: DateCell as Component<CellProps>,
};

export function isCellComponentType(type: unknown): type is CellComponentType {
    return typeof type === "string" && type in CELL_COMPONENTS;
}

/** Default component type derived from the schema column. */
export function defaultCellType(column: TableColumnSchema | undefined): CellComponentType {
    if (!column) return "text";
    if (column.checkOptions && column.checkOptions.length > 0) return "select";
    switch (column.kind) {
        case "boolean":
            return "checkbox";
        case "integer":
        case "number":
            return "number";
        case "date":
            return "date";
        default:
            return "text";
    }
}

/**
 * Resolve the cell component for a result column: an explicit UI Definition
 * setting wins, otherwise the schema column decides.
 */
export function cellComponentFor(
    configuredType: string | undefined,
    column: TableColumnSchema | undefined,
): Component<CellProps> {
    if (isCellComponentType(configuredType)) return CELL_COMPONENTS[configuredType];
    return CELL_COMPONENTS[defaultCellType(column)];
}
