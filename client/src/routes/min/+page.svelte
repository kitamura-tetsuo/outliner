<script lang="ts">
    import { onMount } from "svelte";
    import { SvelteSet } from "svelte/reactivity";

    let items = new SvelteSet<string>(); // SvelteSet is already reactive

    onMount(() => {
        items.add("Item 1");
        items.add("Item 2");

        // Expose environment variables for E2E tests
        if (typeof window !== "undefined") {
            (window as any).testEnvVars = {
                VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
                VITE_FIREBASE_PROJECT_ID: import.meta.env
                    .VITE_FIREBASE_PROJECT_ID,
                VITE_TOKEN_VERIFY_URL: import.meta.env.VITE_TOKEN_VERIFY_URL,
            };
        }
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
