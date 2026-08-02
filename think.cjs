// Let's reconsider.
// I must pick ONE improvement point.
// I can fix a bug.
// Is there a bug with CalendarRoleEditor and CalendarView showing TWO read-only banners?
// Yes!
// In CalendarView.svelte:
// {#if !editability.editable}
//     <p class="hint" data-testid="calendar-read-only-banner">Grid views below render this query's result, but nothing can be dragged until it is writable.</p>
// {/if}
//
// In CalendarRoleEditor.svelte:
// {#if readOnly}
//     <p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>
// {/if}
//
// These two banners literally have the SAME data-testid="calendar-read-only-banner".
// Is this intended? Svelte/Playwright tests just expect count(0) when it becomes editable.
// However, the test `cal-calendar-model-and-role-assignment-5c06604d.spec.ts` originally checks for `.first().toBeVisible()` when checking for read-only banner visibility. But when expecting it to disappear, it uses `.toHaveCount(0)`.
// This dual-banner with the same ID is confusing and causes issues.
// Or maybe I should look at another issue?

// What about Svelte 5 `$state` reactive issues?
// Let's grep for `TODO` in `client/src` to see if there's any easy pick.
