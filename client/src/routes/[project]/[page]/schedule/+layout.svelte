<script lang="ts">
import { page } from "$app/state";
import { isOnPrem } from "../../../../lib/deployment";

let { children } = $props();
</script>

<!--
    The schedule page resolves the page id that every schedule read and write
    targets once, when it mounts.
    SvelteKit keeps a route component mounted when only its parameters change
    (link clicks, history traversal), so this remounts it for each resource.
-->
{#if isOnPrem}
    <main class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-4">Unavailable in this deployment</h1>
        <p>Schedule execution and publishing are not available in on-premises deployments.</p>
    </main>
{:else}
    {#key `${page.params.project}/${page.params.page}`}
        {@render children()}
    {/key}
{/if}
