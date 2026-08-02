// I will propose fixing the duplicate `calendar-read-only-banner`.
// But wait, the one in `CalendarRoleEditor` is ONLY visible when `showSettings` is true (since it's inside `CalendarRoleEditor` which is inside `#if showSettings`).
// Wait, `showSettings` is open in the E2E test `cal-calendar-model-and-role-assignment-5c06604d.spec.ts`?
// Let's check `CalendarView.svelte`:
// `showSettings` is set to `true` on initial sync if `next.query` is empty!
// When the query IS empty, `showSettings` is true. Then the user types the query. `showSettings` remains true!
// So BOTH banners are visible.
//
// Then, when `editability.editable` becomes true, BOTH banners SHOULD disappear.
// But the issue the agent ran into might just be the UI redundancy. Or maybe I should fix something else?
