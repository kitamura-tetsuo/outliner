// Project-level read/write authority (issue #5310, REQ-008).
//
// The current backend authorizes a whole project as one accessible/
// inaccessible unit — `server/src/access-control.ts`'s `checkContainerAccess`
// gates the Yjs WebSocket connection itself, not individual reads and writes
// — rather than granting read and write independently per principal. Both
// capabilities below therefore flow from the same "the project's Y.Doc is
// usable" signal today.
//
// This module is the single seam Diagram operations consult for project
// authority (see diagramAuthorization.ts), so a future per-principal
// read/write split can be wired in here without touching every call site. It
// defines Diagram operations' *consumption* of project capabilities; it does
// not itself change the project's grant policy.

import type { Project } from "$shared/app-schema";

export interface ProjectCapabilities {
    /** Whether the acting principal may read this project's state at all. */
    canRead: boolean;
    /** Whether the acting principal may mutate this project's state at all. */
    canWrite: boolean;
}

const NO_CAPABILITIES: ProjectCapabilities = { canRead: false, canWrite: false };

/**
 * Read/write capability for `project`, as currently granted by the server's
 * binary project-access check. Absent, denied or unknown project state (an
 * undefined project, or one with no connected `Y.Doc`) resolves to no
 * capability at all — never a default grant.
 */
export function getProjectCapabilities(project: Project | undefined): ProjectCapabilities {
    if (!project || !project.ydoc) return NO_CAPABILITIES;
    return { canRead: true, canWrite: true };
}
