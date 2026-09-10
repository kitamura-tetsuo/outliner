// The authority a Diagram read or mutation boundary consults (issue #5310,
// REQ-008). Read and write are checked independently and neither implies the
// other: opening/browsing the chooser and reading a Diagram's source require
// only `canRead`, while creating, inserting, relocating or editing a Diagram
// additionally require `canWrite` *and* a writable invoking page surface —
// the client-side `isReadOnly` convention already used for outline editing
// (OutlinerTree.svelte), which a read-only presentation can withhold even
// when the principal otherwise has project write capability.

import type { ProjectCapabilities } from "../project/projectCapabilities";

export interface DiagramAuthorization {
    capabilities: ProjectCapabilities;
    /**
     * Whether the page surface invoking the operation is itself writable
     * (false for a read-only/demo-reset presentation). Irrelevant to reads.
     */
    surfaceWritable: boolean;
}

/** Opening/browsing the chooser, Diagram lookup, and source reads. */
export function canReadDiagrams(auth: DiagramAuthorization): boolean {
    return auth.capabilities.canRead;
}

/** Creation, insertion, placement changes, and Diagram/source mutations. */
export function canMutateDiagrams(auth: DiagramAuthorization): boolean {
    return auth.capabilities.canRead && auth.capabilities.canWrite && auth.surfaceWritable;
}
