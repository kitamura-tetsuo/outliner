# Demo Project (Feature Tour)

The public demo opens a shared, anonymous demo project. It is the living
showcase of the product: its purpose is to let anyone try **every end-user
feature** without creating an account.

The demo ships one project per language:

| URL                                      | Slug      | Room               | Locale | Content pack                    |
| ---------------------------------------- | --------- | ------------------ | ------ | ------------------------------- |
| <https://outliner-d57b0.web.app/demo>    | `demo`    | `projects/demo`    | `en`   | `server/src/demo-content.en.ts` |
| <https://outliner-d57b0.web.app/demo-ja> | `demo-ja` | `projects/demo-ja` | `ja`   | `server/src/demo-content.ja.ts` |

Each locale is a separate Yjs document, not a translation layer over a shared
one: the demo content _is_ user data — visitors edit it, and they navigate by
page titles that are themselves translated.

### The slug carries three identities

For every demo project these must stay equal:

```
slug  ==  project title  ==  `projects/<slug>` room id  ==  first URL segment
```

Internal links are rendered from `project.title`, so a document whose title
disagreed with its room would emit links pointing into a different project.
Keeping the three in lockstep is what lets `/demo-ja/<page>` resolve with no
locale-aware routing logic anywhere in the app.

Two consequences worth knowing:

- Never test for the demo with a path prefix. `"/demo-ja/…".startsWith("/demo")`
  is true, and so is `/demonstration` — use `isDemoProjectSlug` (exact match) or
  the route's own `demoProject` param.
- The English demo keeps the bare `demo` slug rather than `demo-en`, so its
  long-published URLs never move.

### Adding a locale

Two edits, nothing else:

1. Add `{ slug: "demo-<locale>", locale: "<locale>" }` to `DEMO_PROJECTS` in
   [`shared/src/demoProjects.ts`](../shared/src/demoProjects.ts) — the single
   source of truth both the client and the server read.
2. Add `server/src/demo-content.<locale>.ts` exporting a
   `DemoLocaleContent` pack, and register it in `localeContentLoaders` in
   `server/src/demo-content.ts`.

The route tree, the seeding endpoint, anonymous access and the standalone
table/schedule/calendar routes all pick it up with no further changes.

## How it works

- Structure shared by every locale — types, ids, SQL, dates, and the seeding
  logic — lives in [`server/src/demo-content.ts`](../server/src/demo-content.ts).
  The strings a visitor reads live in the per-locale packs, and
  `demoPagesFor(locale)` merges a pack over the English base.
- Each entry in a locale's `pages` becomes one page of that demo project. The
  first page (`DEMO_LANDING_PAGE_KEY`, `"welcome"`) is the landing page and
  contains a "Feature tour" list with an internal link to every other page.
- **`key` vs `title`**: `title` is translated, so it cannot identify a page
  across locales. `key` is locale-stable and is what the seeded page stores as
  `templatePageId`. The freshness check pairs the key with the expected title
  _of that locale_, which is what makes renaming a page force a reseed in every
  language. The English keys are byte-identical to the ids earlier versions
  derived (`title.trim().toLowerCase()`), so already-seeded documents need no
  migration.
- The client calls `POST /api/seed-demo` when the demo route is opened
  ([`client/src/lib/demoSeed.ts`](../client/src/lib/demoSeed.ts)). The server
  ([`server/src/demo-api.ts`](../server/src/demo-api.ts)) re-seeds the shared
  document when it is empty, when its content is older than 24 hours, or when
  `DEMO_TEMPLATE_VERSION` has changed.
- The demo project page also shows a "Reset demo content" button that sends
  `POST /api/seed-demo` with `{ "force": true }`, triggering the same reset
  immediately regardless of the 24-hour schedule (FTR-784f295f).
- Tests:
  - `server/tests/demo-seed-content.test.ts` validates the template structure.
  - `server/tests/demo-manual-reset.test.ts` validates the reset policy
    (including the forced reset) and that repeated reseeds keep the shared
    document loadable.
  - `client/e2e/core/dmo-demo-project-feature-tour-7d3e9a1c.spec.ts` validates
    the `/demo` route end to end.
  - `client/e2e/core/dmo-demo-manual-reset-784f295f.spec.ts` validates the
    manual reset button.
  - `server/tests/demo-locale-content.test.ts` validates that every locale keeps
    the shared structure, locale-stable keys, and same-locale internal links.
  - `server/tests/demo-locale-isolation.test.ts` validates that the seeding
    state of one locale never leaks into another, and that the unauthenticated
    endpoint refuses unregistered project names.
  - `client/e2e/core/dmo-multilingual-demo-projects-f8800456.spec.ts` validates
    `/demo-ja` end to end.
- Feature specs: `docs/client-features/dmo-demo-project-feature-tour-7d3e9a1c.yaml`
  (FTR-7d3e9a1c) and `docs/client-features/dmo-multilingual-demo-projects-f8800456.yaml`
  (FTR-f8800456).

## Policy: keep the demo in sync with the feature set

**Intent: the demo project must always demonstrate the current feature set.
Whenever a new end-user feature is added to the application, it must also be
added to the demo project template.**

When you implement a new end-user feature (anything recorded in
`docs/client-features/`), extend the demo template as part of the same change:

1. **Add demo content** in `server/src/demo-content.en.ts` (English is the base
   locale):
   - If the feature belongs to an existing feature group, add one or more
     lines to that page (e.g. a new formatting syntax goes on the
     `Formatting` page).
   - If it opens a new feature group, add a new `DemoPageTemplate` entry with
     a short, hands-on description ("try it" style), and add a corresponding
     `[Page Title]: summary` link under "Feature tour:" on the landing page.
     Give it a `key` — lowercase, locale-stable, never translated.
   - Structure (tables, calendars, schedule rules, ids, SQL) belongs in
     `server/src/demo-content.ts`, shared by every locale.
2. **Translate it into the other locales.** Required when you extended a page a
   locale already overrides — the English fallback is per page, not per line, so
   that locale would otherwise never see the addition. A test enforces this; see
   the translation policy below.
3. **Bump `DEMO_TEMPLATE_VERSION`** so already-seeded demo documents are
   re-seeded with the new content. One number covers every locale: each
   document stores its own `metadata.templateVersion`, so a single bump
   reseeds them all on their next visit.
4. **Update the tests**: the expected page list in
   `client/e2e/core/dmo-demo-project-feature-tour-7d3e9a1c.spec.ts` and, when
   the structure changes, `server/tests/demo-seed-content.test.ts`.

### Translation policy: English fallback, whole pages only

A locale pack is a **sparse override** of the English one, merged by `key`. Know
exactly how coarse that merge is:

- A page a locale has **not** translated seeds in English. Adding a whole new
  feature page in English alone is therefore safe — it appears, untranslated,
  in every locale.
- A page a locale **has** translated is owned by that locale wholesale. Adding a
  line to the English version of an already-translated page does **not** reach
  it. Since extending an existing page is the normal way a new feature enters
  the demo, this is the case that actually comes up.

Merging at the item level was considered and rejected: a demo page is an ordered
list of free-form prose with no stable per-item identity, so interleaving new
English bullets into a translated page yields a half-translated page in
arbitrary order — worse to read than a translation that is briefly behind.

Instead the drift is made **detectable**.
`server/tests/demo-locale-content.test.ts` compares the entry count of every
translated page against its English original and fails, naming the page, the
moment one grows past the other. So extending an English page that a locale
overrides is not silently lossy: CI tells you, and you either translate the new
content or drop that locale's override so the page falls back wholesale.

The fallback has one further trap, enforced by the same test: **internal links
must name page titles of their own locale**. A landing page translated to link
`[書式]` while the Formatting page fell back to English "Formatting" leaves a
link no page in that project answers to. In practice, translating any page also
means translating the landing page's link to it. Cross-project links carry the
slug too (`[/demo-ja/公開と共有/schedule]`), so they move with the translation.

Writing guidelines for demo pages:

- Write the base content in English, in plain instructional sentences.
- Prefer interactive examples the visitor can try immediately over abstract
  descriptions.
- Keep each page focused on one feature group; one page rarely needs more
  than ~12 top-level lines. Indent lines by two spaces per nesting level.
- Internal links use `[Page Title]` syntax and must match the `title` of
  another page **of the same locale** exactly.
- Never translate SQL (`sqlName`, `schemaSql`, `query`), RRULEs, ids, enum
  values or dates — only the strings a visitor reads.

## Seeding non-text content (live components & metadata)

The demo is also the surface a coding agent uses to verify a deployed build, so
it must seed **every kind of item**, not just text. A `demoPages` entry can
use one of two forms:

- `lines: string[]` — the text-only form. Two leading spaces per nesting level.
- `items: DemoItem[]` — the structured form, used when a page seeds non-text
  content. Each `DemoItem` can specify:
  - `componentType: "yjstable"` — render a live database table block instead
    of text. Set `yjsTableId` to the id of an entry in `demoTables` (in
    `server/src/demo-content.ts`); the table's schema, UI definition and
    records are seeded into its own subdoc room by the demo API.
  - `votes: string[]` — seed votes from these voter ids.
  - `comments: { author, text }[]` — seed a comment thread.
  - `attachments: string[]` — seed attachment urls (use `data:` URIs so they
    render offline).
  - `ref` / `aliasTo` — label an item with `ref`, then declare another item
    with `aliasTo: <ref>` to seed an alias that mirrors it. Aliases resolve to a
    target on the same page, so keep both items on one page.
  - `children: DemoItem[]` — nested items.

Beyond the pages, the template also seeds **schedule rules** (recurring SQL
execution against a table). `buildDemoScheduleRules()` in
`server/src/demo-content.ts` defines them and `registerDemoScheduleRules()`
writes them into the project doc's `schedules` map; the reset clears that map
first, so user experiments do not accumulate. The two seeded rules drive the
`Recurring Tasks` page: they read the definitions from the `Routine Templates`
table and append the daily and weekly occurrences to the `Routine Occurrences`
table. Their dtstarts are relative to
the seeding moment (today's midnight / this week's Monday), so the first
occurrence is due immediately and the rule visibly runs shortly after a reset.

The `Advanced Features` page seeds a live database table (with a chart view) and an alias;
the `Comments and Votes` page seeds a real comment thread and a voted item.
When you add a feature with a non-text representation, prefer the structured
form so the demo seeds a working instance of it.

Features that are intentionally not demonstrated (e.g. account management,
admin tooling, or destructive operations) do not need demo pages; when in
doubt, record the omission in `docs/NON_GOALS.md`.

## Destructive-action policy

Deleting an entry or record should always prompt between removing it and cancelling the action, so a keystroke never silently discards writing. This applies to both calendar entries and grid rows.
