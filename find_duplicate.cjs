console.log(`
The error in my first run (the flaky tests):
cal-calendar-model-and-role-assignment-5c06604d.spec.ts
cal-delete-disposition-prompt-f556fc72.spec.ts

When they failed, Playwright said:
"expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0) fails because the banner count is 2."

But look at the code!
CalendarView.svelte has ONE:
\`<p class="hint" data-testid="calendar-read-only-banner">Grid views below render this query's result, but nothing can be dragged until it is writable.</p>\`

CalendarRoleEditor.svelte has ONE:
\`<p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>\`

So when the calendar is read-only, there are exactly TWO elements with data-testid="calendar-read-only-banner" on the page!
When we test for it to disappear, we expect count 0.
But it failed because it received count 2!

This means when it failed, BOTH banners were still on the page!
Why? Because the query was still considered readOnly by the time the test timed out (15000ms), OR the Svelte reactive state didn't update!

BUT notice in the earlier log: "QUERY INPUT: SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items". The query HAS been set to the editable one. But the banners did not go away immediately!
Could it be that the PGlite query didn't execute successfully, so result.columns didn't get updated with source_kind/source_id, so editability.editable stayed false?

Yes, if PGlite failed to execute the query (e.g. table not ready?), or if the query threw an error!
Wait, in my debug output I also logged:
\`console.log("ERRORS:", await page.getByTestId("calendar-query-error").allTextContents());\`
And the output was:
\`ERRORS: []\`
So there was NO query error. The query succeeded, but maybe result.columns didn't update?

Or maybe the timeout is simply because typing the query triggers 'commitQuery' via 'onchange', which requires 'blur'.
Wait!
\`\`\`
<input id="calendar-query-input" ... onchange={commitQuery} />
\`\`\`
In the test:
\`\`\`
await queryInput.fill("SELECT ...");
await queryInput.blur();
\`\`\`
When \`blur()\` is called, \`onchange\` fires, which calls \`updateCalendar\` updating Y.Map.
Then Y.Map observer fires \`refreshMirror\`, which sets \`settings = next\` and calls \`scheduleRequery\`.
Then \`setTimeout\` runs \`runQuery\`.
Then PGLite executes.
Then \`result\` is set.
Then \`editability\` re-evaluates.
Then the banners disappear.

Why does it SOMETIMES take more than 15s or fail entirely?
Could it be that `requeryTimer` gets cleared repeatedly? No.
Could it be that `queryGeneration` check failed?
\`\`\`
    const generation = ++queryGeneration;
    const outcome = await runCalendarQuery(...);
    if (generation !== queryGeneration) return;
\`\`\`
If we blur, and it fires, it's 1 generation.
What if Yjs remote updates trigger it again?
Wait, if `refreshMirror` runs, it calls `scheduleRequery` if `queryChanged`.
If `isInitialSyncDone` is already true, it will just schedule requery.
Is it possible that `result` is never updated because `runCalendarQuery` takes too long or silently hangs?
`)
