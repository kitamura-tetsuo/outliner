// Yjs data model for the Mermaid Diagram feature (issue #5310).
//
// A Diagram owns exactly one authoritative collaborative text source and no
// other data — unlike a Calendar it needs no query/view settings, and unlike
// a Grid it needs no subdoc. A flat `diagrams` Y.Map on the project doc
// (id -> Y.Map{format, source}) holds every Diagram, in the same top-level
// registry shape `calendars` already uses (see calendarService.ts). The
// source's Y.Text instance is created once, at Diagram creation, and is never
// replaced: reading or remounting an object must never fabricate a second
// source (REQ-006).

import type { Project } from "$shared/app-schema";
import type { DiagramValueType } from "$shared/types/yjs-types";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";

/** The only Diagram format this experiment supports (issue #5310, REQ-001). */
export const MERMAID_DIAGRAM_FORMAT = "mermaid";

export interface DiagramSummary {
    id: string;
    format: string;
    source: string;
}

/** The registry map in the project doc: diagramId -> Y.Map{format, source}. */
export function getDiagramMap(project: Project, diagramId: string): Y.Map<DiagramValueType> | undefined {
    return project.diagrams.get(diagramId);
}

function readDiagramSourceText(diagramMap: Y.Map<DiagramValueType>): Y.Text | undefined {
    const t = diagramMap.get("source");
    return t instanceof Y.Text ? t : undefined;
}

function readDiagramSummary(id: string, diagramMap: Y.Map<DiagramValueType>): DiagramSummary {
    return {
        id,
        format: String(diagramMap.get("format") ?? MERMAID_DIAGRAM_FORMAT),
        source: readDiagramSourceText(diagramMap)?.toString() ?? "",
    };
}

export function getDiagram(project: Project, diagramId: string): DiagramSummary | undefined {
    const diagramMap = getDiagramMap(project, diagramId);
    return diagramMap ? readDiagramSummary(diagramId, diagramMap) : undefined;
}

/** Every Diagram in the project, including one with zero occurrences (REQ-004). */
export function listDiagrams(project: Project): DiagramSummary[] {
    const entries: DiagramSummary[] = [];
    project.diagrams.forEach((diagramMap, id) => {
        entries.push(readDiagramSummary(id, diagramMap));
    });
    return entries;
}

/**
 * Create a new Diagram registry entry and return its id. The source starts
 * empty — empty or syntactically invalid Mermaid source must remain valid
 * stored content (REQ-001), so no placeholder text is seeded.
 */
export function createDiagram(
    project: Project,
    options: { diagramId?: string; initialSource?: string; } = {},
): string {
    const diagramId = options.diagramId ?? uuid();
    const diagramMap = new Y.Map<DiagramValueType>();
    diagramMap.set("format", MERMAID_DIAGRAM_FORMAT);
    const source = new Y.Text();
    if (options.initialSource) source.insert(0, options.initialSource);
    diagramMap.set("source", source);
    project.diagrams.set(diagramId, diagramMap);
    return diagramId;
}

/**
 * Replace a Diagram's source with a minimal diff, mirroring
 * `Item.updateText`: the existing `Y.Text` instance is mutated in place
 * (never replaced), which is what lets two collaborators editing the same
 * Diagram merge instead of clobbering one another once native editing lands.
 */
export function setDiagramSource(project: Project, diagramId: string, text: string): void {
    const diagramMap = getDiagramMap(project, diagramId);
    if (!diagramMap) throw new Error(`Diagram with id ${diagramId} not found`);
    const source = readDiagramSourceText(diagramMap);
    if (!source) throw new Error(`Diagram ${diagramId} has no source text`);

    const current = source.toString();
    if (current === text) return;

    let start = 0;
    while (start < current.length && start < text.length && current[start] === text[start]) {
        start++;
    }
    let end = 0;
    while (
        end < current.length - start
        && end < text.length - start
        && current[current.length - 1 - end] === text[text.length - 1 - end]
    ) {
        end++;
    }
    const deleteLen = current.length - start - end;
    const insertStr = text.slice(start, text.length - end);

    project.ydoc.transact(() => {
        if (deleteLen > 0) source.delete(start, deleteLen);
        if (insertStr.length > 0) source.insert(start, insertStr);
    });
}

/**
 * The actual collaborative `Y.Text` backing a Diagram's source, for a native
 * editor to bind directly to (a later stage). Never creates a second
 * instance — returns `undefined` rather than fabricating one for an unknown
 * or not-yet-loaded Diagram id (REQ-007).
 */
export function getDiagramSourceYText(project: Project, diagramId: string): Y.Text | undefined {
    const diagramMap = getDiagramMap(project, diagramId);
    return diagramMap ? readDiagramSourceText(diagramMap) : undefined;
}

export function diagramExists(project: Project, diagramId: string): boolean {
    return project.diagrams.has(diagramId);
}

/**
 * Subscribe to changes on the diagrams registry: any Diagram created or its
 * source edited. Mirrors the observeDeep mirror pattern (AGENTS.md §11)
 * rather than polling. Returns an unsubscribe function.
 */
export function observeDiagrams(project: Project, onChange: () => void): () => void {
    const handler = () => onChange();
    project.diagrams.observeDeep(handler);
    return () => project.diagrams.unobserveDeep(handler);
}

// Expose for E2E tests that need to populate a Diagram's source through the
// real domain write path before the native source editor exists (issue
// #5310's own test guidance) — never through direct Yjs poking.
// The literal MODE comparison lets Rollup drop this assignment from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    (window as Window & typeof globalThis & { diagramService?: unknown; }).diagramService = {
        createDiagram,
        getDiagram,
        listDiagrams,
        setDiagramSource,
        diagramExists,
    };
}
