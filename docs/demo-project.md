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
- Tests:
  - `server/tests/demo-seed-content.test.ts` validates the template structure.
  - `client/e2e/core/dmo-demo-project-feature-tour-7d3e9a1c.spec.ts` validates
    the `/demo` route end to end.
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

Features that are intentionally not demonstrated (e.g. account management,
admin tooling, or destructive operations) do not need demo pages; when in
doubt, record the omission in `docs/NON_GOALS.md`.
