<script lang="ts">
import { onMount } from "svelte";

let schedules: any[] = $state([]);

onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const pageId = params.get("pageId");
    const idToken = localStorage.getItem("firebase:authUser:*:idToken");
    if (!pageId || !idToken) return;
    try {
        const res = await fetch(`/api/list-schedules?idToken=${idToken}&pageId=${pageId}`);
        if (res.ok) {
            const data = await res.json();
            schedules = data.schedules ?? [];
        }
    }
    catch (e) {
        console.error("failed to fetch schedules", e);
    }
});
</script>

<h1>Schedules</h1>
<table>
    <tbody>
        {#each schedules as sch}
            <tr data-schedule-id={sch.id}>
                <td>{sch.strategy}</td>
            </tr>
        {/each}
    </tbody>
</table>
