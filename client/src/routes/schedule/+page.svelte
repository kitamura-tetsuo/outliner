<script lang="ts">
import { onMount } from "svelte";

type ScheduleEntry = {
    id: string;
    strategy: string;
    cadence?: string;
    lastRunAt?: string;
};

let schedules: ScheduleEntry[] = $state([]);

function formatLastRun(timestamp: string | undefined): string {
    if (!timestamp) {
        return "—";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    const iso = date.toISOString();
    return iso.replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const pageId = params.get("pageId");
    const idToken = localStorage.getItem("firebase:authUser:*:idToken");
    if (!pageId || !idToken) return;
    try {
        const res = await fetch(`/api/list-schedules?idToken=${idToken}&pageId=${pageId}`);
        if (res.ok) {
            const data = await res.json();
            schedules = (data.schedules ?? [])
                .map((entry: ScheduleEntry) => ({
                    id: entry.id,
                    strategy: entry.strategy,
                    cadence: entry.cadence,
                    lastRunAt: entry.lastRunAt,
                }));
        }
    }
    catch (e) {
        console.error("failed to fetch schedules", e);
    }
});
</script>

<title>Schedules | Outliner</title>

<h1>Schedules</h1>
<table>
    <thead>
        <tr>
            <th scope="col">Strategy</th>
            <th scope="col">Cadence</th>
            <th scope="col">Last run (UTC)</th>
        </tr>
    </thead>
    <tbody>
        {#each schedules as sch (sch.id)}
            <tr data-schedule-id={sch.id}>
                <td>{sch.strategy}</td>
                <td>{sch.cadence ?? "—"}</td>
                <td>{formatLastRun(sch.lastRunAt)}</td>
            </tr>
        {/each}
    </tbody>
</table>
