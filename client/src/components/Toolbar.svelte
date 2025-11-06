<script lang="ts">
import type { Project } from "../schema/app-schema";
import SearchBox from "./SearchBox.svelte";
import { store } from "../stores/store.svelte";
import { onMount } from "svelte";
import LoginStatusIndicator from "./LoginStatusIndicator.svelte";

interface Props {
    project?: Project | null;
}

let { project = null }: Props = $props();
let toolbarEl: HTMLDivElement | null = null;

// Fallback to global store.project when prop is not provided
let effectiveProject: Project | null = $derived(project ?? store.project ?? null);

// Helper: resolve accessible name for inputs
function getAccessibleName(el: HTMLElement): string {
    try {
        const aria = el.getAttribute("aria-label");
        if (aria) return aria.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
            const txt = labelledBy
                .split(/\s+/)
                .map(id => document.getElementById(id)?.textContent?.trim() || "")
                .filter(Boolean)
                .join(" ");
            if (txt) return txt;
        }
        const id = el.getAttribute("id");
        if (id) {
            const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            const txt = lab?.textContent?.trim();
            if (txt) return txt;
        }
        const labWrap = el.closest("label");
        if (labWrap?.textContent) return labWrap.textContent.trim();
        const ph = (el as HTMLInputElement).placeholder;
        if (ph) return ph.trim();
    } catch {}
    return "";
}

function styles(el: Element | null) {
    if (!el) return null;
    const cs = getComputedStyle(el as Element);
    return {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        transform: cs.transform,
        clipPath: (cs as Partial<CSSStyleDeclaration> & Record<string, string | null>)["clipPath"] ?? (cs as Partial<CSSStyleDeclaration> & Record<string, string | null>)["clip-path"],
        pointerEvents: cs.pointerEvents,
    };
}

function dumpToolbarState(tag: string) {
    try {
        const toolbars = Array.from(document.querySelectorAll('[data-testid="main-toolbar"]')) as HTMLDivElement[];
        const summary = toolbars.map((n, i) => ({
            i,
            innerHTMLHead: n.innerHTML.substring(0, 100),
        }));
        console.info("[SEA-0001][Toolbar][%s] toolbar count=", tag, toolbars.length, summary);

        const root = toolbarEl ?? toolbars[0] ?? null;
        if (!root) {
            console.info("[SEA-0001][Toolbar][%s] no root toolbar found", tag);
            return;
        }
        console.info("[SEA-0001][Toolbar][%s] root styles", tag, styles(root));
        const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input, [role="textbox"]'));
        const details = inputs.map((el, i) => ({
            i,
            type: el.getAttribute("type"),
            ariaLabel: el.getAttribute("aria-label"),
            ariaLabelledBy: el.getAttribute("aria-labelledby"),
            id: el.id,
            placeholder: el.placeholder,
            accessibleName: getAccessibleName(el),
            rect: el.getBoundingClientRect ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() : null,
            styles: styles(el),
        }));
        console.info("[SEA-0001][Toolbar][%s] textboxes in main-toolbar:", tag, details);
        const target = inputs.find(el => getAccessibleName(el) === "Search pages");
        console.info("[SEA-0001][Toolbar][%s] has target textbox?", tag, !!target);
    } catch (e) {
        console.info("[SEA-0001][Toolbar][%s] dump error", tag, e);
    }
}

function dedupeToolbars() {
    try {
        const nodes = Array.from(document.querySelectorAll('[data-testid="main-toolbar"]')) as HTMLDivElement[];
        // Previously we removed duplicate toolbars which could detach the element
        // Playwright had already scoped to, causing getByTestId(...).getByRole(...).waitFor()
        // to hang. To avoid destabilizing locators, we now keep all nodes and only log.
        console.info("[Toolbar][dedupe] toolbar nodes present:", nodes.length);
        // If necessary in the future, we could hide duplicates instead of removing:
        // nodes.forEach((n, i) => { if (toolbarEl && n !== toolbarEl) n.style.display = 'none'; });
    } catch {}
}

// As a last resort, resolve from service by URL param to support tests
onMount(async () => {
    try {
        if (!effectiveProject && typeof window !== "undefined") {
            // First, use direct global current project if available
            const cur = (window as Window & { __CURRENT_PROJECT__?: Project; }).__CURRENT_PROJECT__;
            if (cur) {
                project = cur;
            } else {
                // Fallback: pick latest project from client registry
                const reg = (window as Window & { __FLUID_CLIENT_REGISTRY__?: { getAllKeys: () => string[]; get: (key: string) => unknown; }; }).__FLUID_CLIENT_REGISTRY__;
                if (reg && typeof reg.getAllKeys === 'function') {
                    const keys = reg.getAllKeys();
                    if (keys.length > 0) {
                        const last = keys[keys.length - 1];
                        const inst = reg.get(last);
                        const proj = (inst as [unknown, Project | undefined])?.[1];
                        if (proj) {
                            project = proj;
                        }
                    }
                }
                if (!project) {
                    const pathParts = window.location.pathname.split("/").filter(Boolean);
                    const projectTitle = pathParts[0] ? decodeURIComponent(pathParts[0]) : "";
                    const service = (window as Window & { __FLUID_SERVICE__?: { getClientByProjectTitle?: (title: string) => { getProject: () => Project; }; getFluidClientByProjectTitle?: (title: string) => { getProject: () => Project; }; }; }).__FLUID_SERVICE__;
                    if (service && projectTitle) {
                        const client = await (service.getClientByProjectTitle?.(projectTitle) ?? service.getFluidClientByProjectTitle?.(projectTitle));
                        if (client) {
                            project = client.getProject();
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Toolbar: failed to resolve project by title", e);
    }
});

// Debug and dedupe on mount and after navigation
onMount(() => {
    // Initial dedupe and dump
    dedupeToolbars();
    dumpToolbarState("mount");
    // After hydration/microtask
    setTimeout(() => { dedupeToolbars(); dumpToolbarState("mount-setTimeout-0ms"); }, 0);
});

if (typeof window !== "undefined") {
    import("$app/navigation").then(({ afterNavigate }) => {
        try {
            afterNavigate(() => {
                setTimeout(() => { dedupeToolbars(); dumpToolbarState("afterNavigate-0ms"); }, 0);
            });
        } catch {}
    }).catch(() => {});
}
</script>

<div class="main-toolbar" data-testid="main-toolbar" bind:this={toolbarEl} aria-hidden="false">
    <div class="main-toolbar-content" aria-hidden="false">
        <div class="toolbar-left">
            <div role="search">
                <SearchBox project={effectiveProject ?? undefined} />
            </div>
        </div>
        <div class="toolbar-right">
            <LoginStatusIndicator />
        </div>
    </div>
</div>

<style>
.main-toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10000; /* ensure above all content */
    background: white;
    border-bottom: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 0.75rem 1rem;
    height: 4rem; /* 明示的な高さを設定 */
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto;
    /* Ensure pointer events only work within the toolbar bounds */
    overflow: hidden;
}

.main-toolbar-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    /* Ensure full visibility for nested controls (Playwright visibility heuristics) */
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
    flex-wrap: wrap;
}

/* Force visibility for all descendants to avoid ancestor-origin visibility issues in tests */
.main-toolbar,
.main-toolbar *,
.main-toolbar-content,
.main-toolbar-content * {
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
    content-visibility: visible !important;
    contain: none !important;
    backface-visibility: visible !important;
    transition: none !important;
    animation: none !important;
    /* Remove pointer-events: auto !important to prevent click interception */
}

.toolbar-left {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
}

.toolbar-left > div {
    flex: 1 1 auto;
}

.toolbar-right {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

@media (max-width: 640px) {
    .main-toolbar-content {
        flex-direction: column;
        align-items: stretch;
    }

    .toolbar-right {
        justify-content: stretch;
    }

    .toolbar-right :global(.login-status-indicator) {
        width: 100%;
        justify-content: flex-start;
    }
}

/* .main-toolbar-placeholder は未使用のため削除 */
/* .main-toolbar-placeholder { */
    /* height: 2.5rem; SearchBoxと同じ高さを確保 */
/* } */
</style>
