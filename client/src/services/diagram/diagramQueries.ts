// The read boundary Diagram lookup and chooser browsing consult (issue
// #5310, REQ-008). Denial never exposes protected Diagram data: a capability
// failure returns a result with no `data` field at all, rather than an empty
// list a caller could mistake for "no diagrams exist".

import type { Project } from "$shared/app-schema";
import { canReadDiagrams, type DiagramAuthorization } from "./diagramAuthorization";
import { type DiagramSummary, getDiagram, listDiagrams } from "./diagramService";

export type DiagramReadResult<T> =
    | { ok: true; data: T; }
    | { ok: false; reason: "capability-denied"; };

export function readListDiagrams(
    project: Project,
    auth: DiagramAuthorization,
): DiagramReadResult<DiagramSummary[]> {
    if (!canReadDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    return { ok: true, data: listDiagrams(project) };
}

export function readDiagram(
    project: Project,
    diagramId: string,
    auth: DiagramAuthorization,
): DiagramReadResult<DiagramSummary | undefined> {
    if (!canReadDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    return { ok: true, data: getDiagram(project, diagramId) };
}
