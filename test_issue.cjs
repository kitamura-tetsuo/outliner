// Let's reconsider the issue I found earlier with the components:
// In `YjsTableBlock.svelte`:
// `<select onchange={(e) => { selectedExistingTableId = e.target.value }}>`
// and
// `function selectExistingTable() { if (selectedExistingTableId) { setItemTableId(item, selectedExistingTableId); ... } }`
// The `selectedExistingTableId` defaults to the first option, but if the user DOESN'T trigger `onchange` (because they just click "Select" immediately on the first pre-selected option), `selectedExistingTableId` WILL BE undefined.
// Wait! Svelte 5 `$effect` in `YjsTableBlock.svelte`:
// `$effect(() => { if (creationMode === "existing" && existingTables.length > 0 && !selectedExistingTableId) { selectedExistingTableId = existingTables[0].tableId; } });`
// Is it really working?
// Yes, the `$effect` is setting it.

// What about CalendarBlock.svelte?
// `$effect(() => { if (creationMode === "existing" && existingCalendars.length > 0 && !selectedExistingCalendarId) { selectedExistingCalendarId = existingCalendars[0].id; } });`

// Let's check `CalendarBlock.svelte` again, the `$effect` is correctly selecting the first one.

// What was the issue with the `calendar-read-only-banner`?
// The problem is that sometimes Playwright tests fail locally with `Count is 2, expected 0`.
// It only happens when they fail, which is intermittent.
// Is there ANY bug with the `calendar-read-only-banner`?
// Having 2 banners with the exact same `data-testid` is technically a bug in the testing structure / UI UX.
// But is there a real UI/UX bug there?
// Yes, when the calendar is read-only, we are showing TWO banners!
// 1. In `CalendarRoleEditor.svelte`:
//    <p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>
// 2. In `CalendarView.svelte`:
//    {#if !editability.editable}
//        <p class="hint" data-testid="calendar-read-only-banner">Grid views below render this query's result, but nothing can be dragged until it is writable.</p>
//    {/if}
//
// These are TWO separate strings.
// String 1: "Read-only calendar: the query must SELECT both "source_kind" and "source_id" so an entry can be addressed for a write. Nothing on this calendar can be dragged until it does."
// String 2: "Grid views below render this query's result, but nothing can be dragged until it is writable."
//
// Displaying TWO read-only banners at the same time is redundant and poor UI/UX. The user sees:
// "Read-only calendar: the query must SELECT both... Nothing on this calendar can be dragged until it does."
// AND
// "Grid views below render this query's result, but nothing can be dragged until it is writable."
// Both convey the same message, but one is in the settings panel (`CalendarRoleEditor`), and the other is right above the grid (`CalendarView`).
