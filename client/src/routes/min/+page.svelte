<script lang="ts">
    import { onMount } from "svelte";
    import { SvelteSet } from "svelte/reactivity";

    let items = new SvelteSet<string>(); // SvelteSet is already reactive

    onMount(() => {
        items.add("Item 1");
        items.add("Item 2");
    });
</script>

<div class="p-4">
    <h1 class="text-xl font-bold">Min Page</h1>
    <ul>
        {#each [...items] as item (item)}
            <li>{item}</li>
        {/each}
    </ul>
</div>
