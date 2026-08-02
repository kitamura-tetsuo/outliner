console.log(`
The issue is that there are 2 count of \`calendar-read-only-banner\`.
If we look at \`CalendarRoleEditor.svelte\`, we have:
\`\`\`
    {#if readOnly}
        <p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>
    {/if}
\`\`\`

If we look at \`CalendarView.svelte\`, we have:
\`\`\`
    {#if !editability.editable}
        <p class="hint" data-testid="calendar-read-only-banner">Grid views below render this query's result, but nothing can be dragged until it is writable.</p>
    {/if}
\`\`\`

So when \`editability.editable\` is false, \`readOnly\` is true in \`CalendarRoleEditor.svelte\` since we pass \`readOnly={!editability.editable}\`.
Therefore, there are TWO elements with \`data-testid="calendar-read-only-banner"\` on the page when read-only.
When we change the query to be editable, \`editability.editable\` becomes true, so BOTH should disappear.
BUT wait! The test error says: "count 2 instead of 0", meaning it stays at 2 even after updating the query!

Let's check the test script carefully:
\`\`\`
        await queryInput.fill(
            "SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });
\`\`\`

Wait, why did my debug print say:
\`ERRORS: []
BANNER TEXT: [
  'Read-only calendar: the query must SELECT both "source_kind" and "source_id" so an entry can be addressed for a write. Nothing on this calendar can be dragged until it does.',
  "Grid views below render this query's result, but nothing can be dragged until it is writable."
]
QUERY INPUT: SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items\`

The query input HAS the values, but the banners are still there!
Is Svelte 5 updating the `editability` properly when `settings.query` is modified?

Let's look at `CalendarView.svelte` again.
\`const editability = $derived(analyzeCalendarEditability(result.columns));\`

Wait, `editability` depends on \`result.columns\`.
And \`result\` is populated by running the query!
\`let result = $state<TableQueryResult>({ columns: [], rows: [] });\`
`)
