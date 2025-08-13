<script lang="ts">
import type { Project } from "@common/schema/app-schema";
import SearchBox from "./SearchBox.svelte";

interface Props {
    project?: Project | null;
}

let { project = null }: Props = $props();
</script>

<div class="main-toolbar" data-testid="main-toolbar">
    <div class="main-toolbar-content">
        {#if project}
            <SearchBox {project} />
        {:else}
            <div class="main-toolbar-placeholder">
                <!-- プロジェクト読み込み中 -->
            </div>
        {/if}
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
