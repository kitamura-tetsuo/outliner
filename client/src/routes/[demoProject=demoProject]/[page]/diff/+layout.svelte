<script lang="ts">
import { page } from "$app/state";

let { children } = $props();
</script>

<!--
    The demo diff page binds its heading, snapshots and live Yjs subscription to
    the page it mounted with.
    SvelteKit keeps a route component mounted when only its parameters change
    (link clicks, history traversal), so this remounts it for each resource.
-->
{#key `${page.params.demoProject}/${page.params.page}`}
    {@render children()}
{/key}
