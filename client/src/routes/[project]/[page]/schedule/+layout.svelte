<script lang="ts">
import { page } from "$app/state";

let { children } = $props();
</script>

<!--
    The schedule page resolves the page id that every schedule read and write
    targets once, when it mounts.
    SvelteKit keeps a route component mounted when only its parameters change
    (link clicks, history traversal), so this remounts it for each resource.
-->
{#key `${page.params.project}/${page.params.page}`}
    {@render children()}
{/key}
