<script lang="ts">
import { page } from "$app/state";

let { children } = $props();
</script>

<!--
    Management tools open their project connection when they mount (Import/Export
    and the Graph view only there).
    SvelteKit keeps a route component mounted when only its parameters change
    (link clicks, history traversal), so this remounts it for each resource.
-->
{#key page.params.project}
    {@render children()}
{/key}
