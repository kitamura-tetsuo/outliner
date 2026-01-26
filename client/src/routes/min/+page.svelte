<script lang="ts">
    import { onMount } from "svelte";
    import { SvelteSet } from "svelte/reactivity";

    let items = new SvelteSet<string>(); // Use SvelteSet instead of built-in Set

    onMount(() => {
        items.add("Item 1");
        items.add("Item 2");
    });
</script>

<div class="p-4">
    <h1 class="text-xl font-bold">Min Page</h1>
    <ul>
        {#each items as item}
            <li>{item}</li>
        {/each}
    </ul>
</div>
