<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { onMount } from "svelte";
import { userManager } from "../../auth/UserManager";

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

onMount(() => {
    const init = async () => {
    const params = new URLSearchParams(window.location.search);
    const pageId = params.get("pageId");
    if (!pageId) return;
    // Wait until Firebase restored the persisted session, otherwise currentUser
    // is still null while the page mounts and the request would be skipped.
    await userManager.auth.authStateReady();
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) return;
    try {
        const res = await fetch("/api/list-schedules", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ pageId }),
        });
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
        logger.error({ error: e }, "failed to fetch schedules");
    }
    };
    init();
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
