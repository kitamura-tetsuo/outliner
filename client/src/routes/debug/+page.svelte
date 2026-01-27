<script lang="ts">
    import { onMount } from "svelte";
    import { firestoreStore } from "../../stores/firestoreStore.svelte";

    let debugInfo = $state("");
    let projects: any[] = $state([]);

    onMount(async () => {
        debugInfo += `User: ${
            firestoreStore.currentUser ? firestoreStore.currentUser.uid : "None"
        }\n`;
        debugInfo += `Accessible Projects: ${JSON.stringify(
            firestoreStore.accessibleProjectIds,
        )}\n`;

        // Wait a bit and reload
        setTimeout(() => {
            debugInfo += `User (after wait): ${
                firestoreStore.currentUser
                    ? firestoreStore.currentUser.uid
                    : "None"
            }\n`;
            debugInfo += `Accessible Projects (after wait): ${JSON.stringify(
                firestoreStore.accessibleProjectIds,
            )}\n`;
        }, 2000);
    });

    $effect(() => {
        if (firestoreStore.currentUser) {
            // Load projects?
            // Actually, we can just view store state
        }
    });
</script>

<div class="p-8">
    <h1 class="text-2xl font-bold mb-4">Debug Page</h1>

    <div class="mb-8">
        <h2 class="text-xl font-semibold mb-2">Firestore Store State</h2>
        <pre
            class="bg-gray-100 p-4 rounded border overflow-auto text-xs">{debugInfo}</pre>
    </div>

    <div class="mb-8">
        <h2 class="text-xl font-semibold mb-2">Projects List (Test)</h2>
        <ul>
            {#each projects as project (project.id)}
                <li>{project.title} ({project.id})</li>
            {/each}
        </ul>
    </div>
</div>
