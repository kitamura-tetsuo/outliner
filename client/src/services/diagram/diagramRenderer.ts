import DOMPurify from "dompurify";
import mermaid from "mermaid";

let initialized = false;
let globalInstanceCounter = 0;

export function getNextDiagramInstanceId(): number {
    return ++globalInstanceCounter;
}

export function initMermaid() {
    if (initialized) return;
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        maxEdges: 500, // REQ-009
        // Issue #5409: never insert Mermaid's built-in syntax-error diagram
        // ("Syntax error in text ... mermaid version ...") into the page.
        // Outliner shows its own in-block `.diagram-error` instead. With this
        // flag set, a rejected source makes `render` remove its temporary
        // nodes and throw, so the fallback output is never created.
        suppressErrorRendering: true,
        // Host-owned configuration boundary: these keys can only be set via
        // `initialize`, never by diagram-authored frontmatter or
        // `%%{init}%%` directives (Mermaid strips them from directives before
        // merging). This pins Mermaid's documented default secure set
        // verbatim, so a source requesting `suppressErrorRendering: false`
        // cannot re-enable the library fallback (AS-006).
        secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges"],
    });
    initialized = true;
}

/**
 * Render Mermaid source through the shared host-owned configuration.
 *
 * The attempt runs inside a staging element owned by the calling Diagram
 * block: it is appended to the block's own subtree (never `document.body`),
 * kept zero-size and non-interactive so text measurement still works, and
 * always removed once the attempt settles. Temporary nodes — and any
 * fallback output the library would produce for a rejected source — therefore
 * cannot leak to the page footer, even transiently (issue #5409 REQ-001).
 * Callers must still catch rejection and show Outliner's in-block error.
 */
export async function renderMermaidDiagram(
    parent: Element | null | undefined,
    diagramId: string,
    source: string,
): Promise<{ svg: string; }> {
    initMermaid();
    const staging = document.createElement("div");
    staging.setAttribute("data-mermaid-staging", diagramId);
    staging.setAttribute("aria-hidden", "true");
    staging.style.position = "absolute";
    staging.style.width = "0";
    staging.style.height = "0";
    staging.style.overflow = "hidden";
    staging.style.pointerEvents = "none";
    if (parent) parent.appendChild(staging);
    try {
        return await mermaid.render(diagramId, source, staging);
    } finally {
        staging.remove();
    }
}

export const sanitizeSvg = (svg: string) => {
    // Mermaid uses strict mode so it already purifies, but if we do it again
    // we must allow all the tags mermaid uses
    return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true },
        ADD_TAGS: ["foreignObject"],
        ADD_ATTR: ["xmlns:xhtml"],
    });
};
