// The outline surface a user command is invoked from (issue #5311, REQ-010).
//
// Project-level commands such as Undo/Redo are not issued through one Diagram
// occurrence: they come from the editor surface the user is working in. Each
// mounted top-level outline registers a getter for its *current* writability
// (read-only presentation, demo reset in progress, ...). The most recently
// mounted surface is the invoking one. With none mounted there is no writable
// invoking surface, which is never treated as a grant.

const surfaces: Array<{ isWritable: () => boolean; }> = [];

export function registerEditorSurface(isWritable: () => boolean): () => void {
    const entry = { isWritable };
    surfaces.push(entry);
    return () => {
        const index = surfaces.indexOf(entry);
        if (index !== -1) surfaces.splice(index, 1);
    };
}

/** Whether the surface that is invoking a command is writable right now. */
export function invokingSurfaceWritable(): boolean {
    const current = surfaces[surfaces.length - 1];
    return current ? current.isWritable() : false;
}
