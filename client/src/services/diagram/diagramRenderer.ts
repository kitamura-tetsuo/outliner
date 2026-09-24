import mermaid from "mermaid";
import DOMPurify from "dompurify";

let initialized = false;

export function initMermaid() {
    if (initialized) return;
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        maxEdges: 500, // REQ-009
    });
    initialized = true;
}

export const sanitizeSvg = (svg: string) => {
    // Mermaid uses strict mode so it already purifies, but if we do it again
    // we must allow all the tags mermaid uses
    return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true },
        ADD_TAGS: ["foreignObject"],
        ADD_ATTR: ["xmlns:xhtml"]
    });
}
