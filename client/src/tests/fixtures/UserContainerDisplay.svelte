<script lang="ts">
    type UserProjectData = {
        accessibleProjectIds?: string[];
        defaultProjectId?: string;
    };

    let { storeRef } = $props<{ storeRef: unknown }>();

    let userProject = $derived((storeRef as { userProject?: UserProjectData })?.userProject);
    let idsLocal = $derived(Array.from(userProject?.accessibleProjectIds ?? []));
    let defaultIdLocal = $derived(userProject?.defaultProjectId);

    function computeDisplayed(ids: string[], defaultId: string | undefined): string[] {
        if (!defaultId) return ids;
        return [defaultId, ...ids.filter((id) => id !== defaultId)];
    }
</script>

<div class="user-container-display">
    <div data-testid="default">{defaultIdLocal}</div>
    <ul>
        {#each computeDisplayed(idsLocal, defaultIdLocal) as id (id)}
            <li>{id}</li>
        {/each}
    </ul>
</div>
