# Demo Project (Feature Tour)

The public demo at <https://outliner-d57b0.web.app/demo> opens a shared, anonymous
demo project (room `projects/demo`). It is the living showcase of the product:
its purpose is to let anyone try **every end-user feature** without creating an
account.

## How it works

- The demo content is defined as a template in
  [`server/src/demo-content.ts`](../server/src/demo-content.ts) (`demoPages`).
- Each entry in `demoPages` becomes one page of the demo project. The first
  page (`Demo`) is the landing page and contains a "Feature tour" list with an
  internal link to every other page.
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
- Feature spec: `docs/client-features/dmo-demo-project-feature-tour-7d3e9a1c.yaml`
  (FTR-7d3e9a1c).

## Policy: keep the demo in sync with the feature set

**Intent: the demo project must always demonstrate the current feature set.
Whenever a new end-user feature is added to the application, it must also be
added to the demo project template.**

When you implement a new end-user feature (anything recorded in
`docs/client-features/`), extend the demo template as part of the same change:

1. **Add demo content** in `server/src/demo-content.ts`:
   - If the feature belongs to an existing feature group, add one or more
     lines to that page (e.g. a new formatting syntax goes on the
     `Formatting` page).
   - If it opens a new feature group, add a new `DemoPageTemplate` entry with
     a short, hands-on description ("try it" style), and add a corresponding
     `[Page Title]: summary` link under "Feature tour:" on the landing page.
2. **Bump `DEMO_TEMPLATE_VERSION`** so already-seeded demo documents are
   re-seeded with the new content.
3. **Update the tests**: the expected page list in
   `client/e2e/core/dmo-demo-project-feature-tour-7d3e9a1c.spec.ts` and, when
   the structure changes, `server/tests/demo-seed-content.test.ts`.

Writing guidelines for demo pages:

- Write content in English, in plain instructional sentences.
- Prefer interactive examples the visitor can try immediately over abstract
  descriptions.
- Keep each page focused on one feature group; one page rarely needs more
  than ~12 top-level lines. Indent lines by two spaces per nesting level.
- Internal links use `[Page Title]` syntax and must match the `title` of
  another `demoPages` entry exactly.

## Seeding non-text content (live components & metadata)

The demo is also the surface a coding agent uses to verify a deployed build, so
it must seed **every kind of item**, not just text. A `demoPages` entry can
use one of two forms:

- `lines: string[]` — the text-only form. Two leading spaces per nesting level.
- `items: DemoItem[]` — the structured form, used when a page seeds non-text
  content. Each `DemoItem` can specify:
  - `componentType: "table" | "chart"` — render a live component instead of
    text. For charts, set `chartQuery` to a **self-contained** SQL statement
    (`CREATE TABLE … INSERT … SELECT …`) so the chart renders deterministically
    with no external data source.
  - `votes: string[]` — seed votes from these voter ids.
  - `comments: { author, text }[]` — seed a comment thread.
  - `attachments: string[]` — seed attachment urls (use `data:` URIs so they
    render offline).
  - `ref` / `aliasTo` — label an item with `ref`, then declare another item
    with `aliasTo: <ref>` to seed an alias that mirrors it. Aliases resolve to a
    target on the same page, so keep both items on one page.
  - `children: DemoItem[]` — nested items.

The `Advanced Features` page seeds a live chart, a live table, and an alias;
the `Comments and Votes` page seeds a real comment thread and a voted item.
When you add a feature with a non-text representation, prefer the structured
form so the demo seeds a working instance of it.

Features that are intentionally not demonstrated (e.g. account management,
admin tooling, or destructive operations) do not need demo pages; when in
doubt, record the omission in `docs/NON_GOALS.md`.
