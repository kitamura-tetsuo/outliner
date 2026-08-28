<script lang="ts">
// "Schedules referencing this table" — dependencies, never children.
//
// A Schedule is a project-level entity (issue #5012). It may write to one
// Table while reading several others, so the same Schedule appears in every
// referenced Table's list and none of them owns it. The link therefore points
// at the canonical project-level Schedule route, not at a Table-nested one.

import { onDestroy, onMount } from "svelte";
import type { Project } from "$shared/app-schema";
import {
    findSchedulesReferencingTable,
    type ScheduleTableReference,
} from "../../services/schedule/scheduleRuleService";
import { resolvePath } from "../../utils/pathUtils";
import { projectSchedulePath, projectSchedulesPath } from "../../lib/managementPaths";

interface Props {
    project: Project | undefined;
    projectName: string;
    tableId: string;
}

let { project, projectName, tableId }: Props = $props();

// Yjs -> UI mirror (AGENTS.md §11): the schedules map is observed and this
// plain state reassigned, so edits made on a Schedule page land here.
let references = $state<ScheduleTableReference[]>([]);

function refresh() {
    references = findSchedulesReferencingTable(project, tableId);
}

const schedulesObserver = () => refresh();

onMount(() => {
    project?.schedules?.observeDeep(schedulesObserver);
    refresh();
});

onDestroy(() => {
    project?.schedules?.unobserveDeep(schedulesObserver);
});

function scheduleHref(ruleId: string): string {
    return resolvePath(projectSchedulePath(projectName, ruleId));
}

function kindLabel(kind: ScheduleTableReference["kind"]): string {
    return kind === "write-target" ? "writes to this table" : "reads this table";
}
</script>

<section class="reference-section" data-testid="table-schedule-references">
    <h2 class="reference-title">Schedules referencing this table</h2>
    <p class="reference-note">
        Schedules belong to the project. One schedule may reference several tables.
    </p>
    {#if references.length === 0}
        <p class="empty-state" data-testid="table-schedule-references-empty">
            No schedule references this table.
        </p>
    {:else}
        <ul class="reference-list">
            {#each references as reference (reference.ruleId)}
                <li class="reference-item">
                    <a
                        class="reference-link"
                        href={scheduleHref(reference.ruleId)}
                        data-schedule-id={reference.ruleId}
                    >
                        {reference.ruleName}
                    </a>
                    <span class="reference-kind" data-reference-kind={reference.kind}>
                        {kindLabel(reference.kind)}
                    </span>
                    {#if !reference.enabled}
                        <span class="reference-off">Off</span>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    <a class="all-schedules-link" href={resolvePath(projectSchedulesPath(projectName))}>
        All schedules in this project
    </a>
</section>

<style>
.reference-section {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 12px;
    background: white;
}

.reference-title {
    margin: 0 0 4px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #111827;
}

.reference-note {
    margin: 0 0 8px;
    font-size: 0.75rem;
    color: #6b7280;
}

.empty-state {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7280;
}

.reference-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.reference-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}

.reference-link {
    color: #2563eb;
    font-weight: 500;
    text-decoration: none;
}

.reference-link:hover {
    text-decoration: underline;
}

.reference-kind {
    font-size: 0.72rem;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
}

.reference-off {
    font-size: 0.72rem;
    color: #92400e;
    background: #fef3c7;
    border-radius: 3px;
    padding: 1px 5px;
}

.all-schedules-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 0.8rem;
    color: #2563eb;
    text-decoration: none;
}

.all-schedules-link:hover {
    text-decoration: underline;
}
</style>
