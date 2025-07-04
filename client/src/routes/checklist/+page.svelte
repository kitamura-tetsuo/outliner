<script lang="ts">
import { browser } from "$app/environment";
import Checklist from "../../components/Checklist.svelte";

let mode: "shopping" | "packing" | "habit" | "custom" = "shopping";
let rrule: string | undefined;

if (browser) {
    const stored = localStorage.getItem("CHK_MODE");
    if (stored) mode = stored as typeof mode;
    const rule = localStorage.getItem("CHK_RRULE");
    if (rule) rrule = rule;
}
</script>

<svelte:head>
    <title>Checklist | Fluid Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <Checklist title="Demo Checklist" {mode} {rrule} />
</main>
