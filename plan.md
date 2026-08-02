It was probably renamed to "Tasks and Habits".
So the new list should be EXACTLY the `demoPages` titles lowercased.

Wait, if I just "update the criterion to the complete current list" and "compare required feature-tour metadata against demoPages", the acceptance criterion string will have:
`- The demo project is seeded with one page per feature group (formatting, outliner basics, undo and redo, internal links, schedule rules, search and commands, selection and clipboard, collaboration, comments and votes, publishing and sharing, advanced features, tasks and habits, recurring tasks, calendars)`

The issue description also states:
"Either update the criterion to the complete current list, or make it intentionally non-enumerative and point to the template as authoritative."

I'll choose option A (update the criterion to the complete current list), but wait! If I make it non-enumerative, I don't have to keep a list in sync in the YAML anymore.
If I do:
`- The demo project is seeded with one page per feature group (matching the current template definition)`

Then I don't have a list in the YAML to compare against `demoPages`!
So what did the author mean by "compare required feature-tour metadata against demoPages so drift fails CI"?
If they meant "Make sure whatever list is in the YAML matches demoPages", then if I make it non-enumerative, there's no list to compare. But the author says "compare required feature-tour metadata against demoPages".
Maybe "required feature-tour metadata" IS the YAML?
"Extend server/tests/demo-seed-content.test.ts or a documentation validation test to compare required feature-tour metadata against demoPages so drift fails CI."

Wait, what if `docs/client-features/*.yaml` is the metadata, and every page in the demo MUST have a corresponding `.yaml` file? No, that's not what the issue says.

Let's do Option A. It's safer and implements the exact verification:
1. Update `docs/client-features/dmo-demo-project-feature-tour-7d3e9a1c.yaml` to list the current groups.
2. In `server/tests/demo-seed-content.test.ts`, read the YAML and assert the groups match exactly.
3. Update `client/e2e/core/dmo-demo-project-feature-tour-7d3e9a1c.spec.ts` with the new titles.
4. Pre-commit checks.
5. Submit.

Wait, what if Option B is better? "make it intentionally non-enumerative and point to the template as authoritative"
If I make it intentionally non-enumerative, the test I should add is maybe to ensure that the Landing Page `Feature tour:` links exactly match `demoPages`? The existing test ALREADY checks `demoPages -> Landing Page`, but NOT `Landing Page -> demoPages`.
Let's see if the existing test ensures `Landing Page -> demoPages`.
No, it doesn't.
```typescript
        const tourTexts = childTexts(tour!.items).join("\n");
        for (const page of demoPages) {
            if (page.title === DEMO_LANDING_PAGE_TITLE) continue;
            expect(tourTexts, `tour links to ${page.title}`).to.contain(`[${page.title}]`);
        }
```
If we added an extra link in `tourTexts` that wasn't in `demoPages`, this test wouldn't fail.

Let's just use Option A, it is very explicit and strictly verifies the documentation itself.
Wait, let's write out the new list.
`demoPages` titles (excluding Welcome):
Formatting
Outliner Basics
Undo and Redo
Internal Links
Schedule Rules
Search and Commands
Selection and Clipboard
Collaboration
Comments and Votes
Publishing and Sharing
Advanced Features
Tasks and Habits
Recurring Tasks
Calendars

Lowercased comma separated:
`formatting, outliner basics, undo and redo, internal links, schedule rules, search and commands, selection and clipboard, collaboration, comments and votes, publishing and sharing, advanced features, tasks and habits, recurring tasks, calendars`

Let's draft the plan using Option A!
