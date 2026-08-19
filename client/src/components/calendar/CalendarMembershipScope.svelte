<script lang="ts">
// Lifecycle holder for the project-level calendar membership index (#4981).
//
// The index has to be project-scoped, not block-scoped: an outline item is
// scheduled whether or not a calendar block happens to be mounted, so the
// query lifecycle belongs to whoever is showing the project's outline. This
// component owns nothing but that lifecycle — it renders no markup.
//
// It is mounted under a `{#key}` on the document guid and the connected
// project id (AGENTS.md §11): switching projects — or finishing the connection
// that resolves the SQL schema the queries run against — remounts it instead
// of rebinding observers in place, so no `$effect` has to watch either value.
// Several outline views of the same project share one indexer through the
// refcount in `calendarMembershipService`.

import { onDestroy, onMount } from "svelte";
import { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { acquireCalendarMembershipIndexing } from "../../services/calendar/calendarMembershipService";
import { yjsStore } from "../../stores/yjsStore.svelte";

interface Props {
    ydoc: Y.Doc;
}

let { ydoc }: Props = $props();

let release: (() => void) | undefined;

onMount(() => {
    // `ydoc` is fixed for this component's lifetime: the parent keys on it,
    // so a different document is a different instance of this component,
    // never a prop change to react to.
    release = acquireCalendarMembershipIndexing(Project.fromDoc(ydoc), yjsStore.currentProjectId ?? undefined);
});

onDestroy(() => {
    release?.();
    release = undefined;
});
</script>
