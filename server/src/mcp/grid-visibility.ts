/** Positive, MCP-facing projection of a Grid result/configuration column. */
export interface McpGridColumn {
    name: string;
    shown: boolean;
}

function componentEntries(components: unknown): [string, unknown][] {
    if (isMapLike(components)) return [...components.entries()];
    if (components && typeof components === "object" && !Array.isArray(components)) {
        return Object.entries(components as Record<string, unknown>);
    }
    return [];
}

function isMapLike(value: unknown): value is {
    entries(): IterableIterator<[string, unknown]>;
    get(key: string): unknown;
} {
    return value !== null && typeof value === "object"
        && typeof (value as { entries?: unknown; }).entries === "function"
        && typeof (value as { get?: unknown; }).get === "function";
}

function isHidden(component: unknown): boolean {
    if (isMapLike(component)) return component.get("hidden") === true;
    return component !== null && typeof component === "object"
        && (component as Record<string, unknown>).hidden === true;
}

/** Convert sparse Grid visibility without writing to the Yjs definition. */
export function gridColumnsWithVisibility(components: unknown, names: readonly string[]): McpGridColumn[] {
    const entries = componentEntries(components);
    const componentByName = new Map(entries);
    const orderedNames = [...new Set([...names, ...entries.map(([name]) => name)])];
    return orderedNames.map(name => ({ name, shown: !isHidden(componentByName.get(name)) }));
}

/** Return component settings without leaking the persistence-only `hidden`. */
export function mcpGridComponents(components: unknown): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
        componentEntries(components).map(([name, component]) => {
            const plain = isMapLike(component)
                ? Object.fromEntries(component.entries())
                : component !== null && typeof component === "object" && !Array.isArray(component)
                ? { ...(component as Record<string, unknown>) }
                : component === undefined
                ? {}
                : { type: component };
            const { hidden: _hidden, ...settings } = plain;
            return [name, { ...settings, shown: !isHidden(component) }];
        }),
    );
}
