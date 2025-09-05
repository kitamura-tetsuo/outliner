<script lang="ts">
import type { Project } from "../schema/app-schema";
import SearchBox from "./SearchBox.svelte";
import { store } from "../stores/store.svelte";
import { onMount } from "svelte";

interface Props {
    project?: Project | null;
}

let { project = null }: Props = $props();

// Fallback to global store.project when prop is not provided
let effectiveProject: Project | null = $derived(project ?? store.project ?? null);

// As a last resort, resolve from service by URL param to support tests
onMount(async () => {
    try {
        if (!effectiveProject && typeof window !== "undefined") {
            // First, use direct global current project if available
            const cur = (window as any).__CURRENT_PROJECT__ as Project | undefined;
            if (cur) {
                project = cur;
                return;
            }
            // Fallback: pick latest project from client registry
            const reg = (window as any).__FLUID_CLIENT_REGISTRY__;
            if (reg && typeof reg.getAllKeys === 'function') {
                const keys = reg.getAllKeys();
                if (keys.length > 0) {
                    const last = keys[keys.length - 1];
                    const inst = reg.get(last);
                    const proj = inst?.[4];
                    if (proj) {
                        project = proj;
                        return;
                    }
                }
            }
            const pathParts = window.location.pathname.split("/").filter(Boolean);
            const projectTitle = pathParts[0] ? decodeURIComponent(pathParts[0]) : "";
            const service = (window as any).__FLUID_SERVICE__;
            if (service && projectTitle) {
                const client = await service.getFluidClientByProjectTitle(projectTitle);
                if (client) {
                    project = client.getProject();
                }
            }
        }
    } catch (e) {
        console.warn("Toolbar: failed to resolve project by title", e);
    }
});
</script>

<div class="main-toolbar" data-testid="main-toolbar">
    <div class="main-toolbar-content">
        <SearchBox project={effectiveProject ?? undefined} />
    </div>
</div>

<style>
.main-toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 0.75rem 1rem;
    height: 4rem; /* 明示的な高さを設定 */
}

.main-toolbar-content {
    max-width: 1200px;
    margin: 0 auto;
}

.main-toolbar-placeholder {
    height: 2.5rem; /* SearchBoxと同じ高さを確保 */
}
</style>
