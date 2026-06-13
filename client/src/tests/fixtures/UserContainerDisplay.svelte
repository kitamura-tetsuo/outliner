<script lang="ts">
    import { onMount } from "svelte";

    type UserProjectData = {
        accessibleProjectIds?: string[];
        defaultProjectId?: string;
    };

    export let storeRef: unknown;

    let idsLocal: string[] = [];
    let defaultIdLocal: string | undefined;

    function computeDisplayed(ids: string[], defaultId: string | undefined): string[] {
        if (!defaultId) return ids;
        return [defaultId, ...ids.filter((id) => id !== defaultId)];
    }

    onMount(() => {
        const apply = () => {
            try {
                const u = (storeRef as { userProject?: UserProjectData })?.userProject;
                idsLocal = Array.from(u?.accessibleProjectIds ?? []);
                defaultIdLocal = u?.defaultProjectId;
            } catch {}
        };
        // Initial application + update on additional notification
        apply();
        const interval = setInterval(apply, 100);
        return () => clearInterval(interval);
    });
</script>

<div class="user-container-display">
    <div data-testid="default">{defaultIdLocal}</div>
    <ul>
        {#each computeDisplayed(idsLocal, defaultIdLocal) as id (id)}
            <li>{id}</li>
        {/each}
    </ul>
</div>
