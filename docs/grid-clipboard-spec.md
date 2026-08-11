# Grid copy and paste: view, database, and the world outside

Status: §1–§3 describe implemented behavior
(`docs/client-features/clp-component-block-clipboard-4584c0de.yaml`). §4–§11 are
a proposal and are **not** implemented; they answer four open questions:

1. Is copying a Grid a copy of the _view_ or a copy of the _database_?
2. Should the user be able to choose between the two?
3. How do the answers differ within one project and across projects?
4. What should land in the clipboard when the paste target is another
   application?

§8 extends the answers to the other two block types, Chart and Calendar. §9
lists the decisions these answers make necessary and does **not** settle them.

The short answer, and the rule the rest of this document derives:

> **Wherever a Grid is pasted, it shows the values it showed when it was copied.**
> What varies with distance is not the data but the _liveness_: in its own
> project the paste is another live view of one database; in another project it
> is an independent snapshot, data and all; in another application it is dead
> cells.

The user does not experience "project" as a storage boundary. They copied a grid
with numbers in it, and a paste that produces the same grid with no numbers is
wrong in the same way — and for the same reason — as a paste into Excel that
produces the word `Sales`. Both are the app showing its own seams.

## 1. A Grid is a view; the database is somewhere else

The two halves are separate objects in the data model, and the copy question is
only confusing while they are conflated.

**The view** is an outliner item. It carries `componentType: "yjstable"` and a
binding field `yjsTableId` (`client/src/services/yjstable/itemBinding.ts`). That
is the whole of it — an item that points at a table. Column order, column
labels, hidden columns and the query itself are _not_ on the item; they live in
the table's UI Definition, so two views of one table are today identical views,
not independently configured ones (see §10.1).

**The database** is a Y.Doc subdoc registered in the project doc: `tableId → {
display name, subdoc }` (`client/src/services/yjstable/tableDocs.ts`). It holds
the Schema Definition, the UI Definition and Data Storage. It exists whether or
not any item points at it — `/tables/[project-name]/[table-name]`
(`TBL-3867`) renders a table with no host item at all, and the "Existing Table"
tab in `YjsTableBlock.svelte` binds a new host to a table that already exists.

One fact from `tableDocs.ts` decides most of what follows:

```ts
const subdoc = new Y.Doc({ guid: tableDocGuid(projectDoc.guid, tableId), autoLoad: true });
```

**A table's room id is derived from the project's guid.** A table is not a
free-floating document that projects happen to reference; it is addressed
_through_ its project, and its access control is the project's access control.
Two projects sharing one table is therefore not a feature that has not been
built yet — it is a statement the data model cannot make, and could not make
without also deciding who may read the shared room.

## 2. What happens today

| Copy → paste               | Item       | Table                                                           | Data                                         |
| -------------------------- | ---------- | --------------------------------------------------------------- | -------------------------------------------- |
| Same project               | duplicated | shared binding, same `tableId`                                  | shared — one database, two views             |
| Other project              | duplicated | fresh table: schema + UI cloned, new `tableId`, new subdoc guid | **empty**                                    |
| Other project, clone fails | duplicated | none — binding dropped                                          | none; item degrades to its display name      |
| Other application          | —          | —                                                               | the table's display name as one line of text |

Cut behaves as a move: the host item is removed and re-inserted, and the table
itself is never deleted, so a cut that is never pasted loses a view and not a
database.

Within a project the mode is a **binding copy**. Across projects it is a
**structure clone**, performed by `importTableStructures`
(`client/src/services/yjstable/tableClone.ts`), which rewrites conflicting SQL
relation names, resolves the copied tables into dependency groups, validates
every group against a throwaway PGlite schema, and commits a group into the
destination registry only once all of it validates. A group that fails is
skipped and its hosts fall back to text; independent groups still succeed.

Data Storage is never copied, in either direction.

## 3. Where today's behavior is right, and where it is thin

Right: the same-project rule. Duplicating the rows when a user duplicates a view
would produce two databases that mean the same thing and immediately disagree —
precisely the second source of truth that `docs/crdt-sql-architecture.md`
exists to prevent. If a user drops a second Grid block on another page, they
want to _see_ the sales table there, not to fork it.

Right: the cross-project rule's _shape_. A shared binding is unavailable for the
reason in §1, so an independent clone is the only structure available.

Wrong, and the subject of the rest of this document:

- **The cross-project clone arrives empty.** This is the central defect. A
  shared binding being impossible says nothing about whether the _rows_ should
  travel, and the code conflated the two: because the destination could not
  point at the source database, it also declined to copy anything out of it.
  Those are separate questions, and the answer to the second is yes. §4.
- **The external representation is close to useless.** A user looking at 200
  rows of numbers copies them and gets the word `Sales`. §7. Same defect, one
  boundary further out.
- **The mode is chosen by the destination, never by the user.** Duplicating a
  table to fork it — same schema, same query, own rows — is a real need with no
  gesture at all today. §5.

## 4. Answer to Q1 — the question hides two axes, and they have different answers

"View copy or database copy?" reads as one question but is two, and today's
behavior comes from answering the first and letting the answer fall through to
the second.

**Axis 1 — what object is copied?** The view. The user selected lines of an
outline; the thing in the selection is a host item that points at a table. This
is not a close call: the grid on screen is one query result over relations that
may include several tables and the reserved `outline_items`, so "copy this
Grid's database" is not even well-formed whenever the query spans more than one
relation. Every other block in the same selection copies its appearance and its
identity rather than the storage behind it, and the Grid should not be the
exception.

**Axis 2 — does the destination share the source database, or get its own?**
This is decided by the destination, and it is the only thing the destination
decides:

- **Same project** — it shares. A second live view of one database, because the
  binding is portable and two databases meaning the same thing is the second
  source of truth `docs/crdt-sql-architecture.md` exists to prevent.
- **Another project** — it gets its own, **populated**. A shared binding is
  unavailable (§1), so the destination needs a database of its own; the values
  are what the user copied, so they are copied into it.
- **Another application** — it gets no database at all, only the values as
  cells (§7).

The error in today's implementation is that axis 2's second row was answered
"gets its own, empty". Nothing justifies the "empty": the impossibility of
sharing a room is a fact about `tableDocGuid`, not a reason to withhold rows the
user is looking at and has full access to. Read down that list and the copied
values survive every step; only the liveness decays.

The fallback ranking when a populated clone cannot be built is unchanged: clone
the structure without rows, then degrade to readable text, and never invent a
shared binding across projects.

## 5. Answer to Q2 — yes, but the choice belongs to paste, not to copy

A "copy as reference / copy as duplicate" mode toggle at copy time is the
obvious design and the wrong one:

1. It asks the user to predict where they will paste. A wrong guess is only
   discovered after pasting, and costs a re-copy.
2. It cannot mean anything for the third destination. The clipboard is one
   object read by Outliner _and_ by Excel; a copy-time mode that has no effect
   on what Excel receives is a mode that is only sometimes real.
3. It multiplies with the destination anyway: "duplicate" already means two
   different operations depending on whether the destination is the source
   project.

At paste time all the information exists at once — the payload, the destination
project, and whether the source is still reachable. So:

**Default paste (`Ctrl/Cmd+V`) follows §4** and has nothing to configure: same
project → another view; other project → independent clone _with its data_.
Either way the user sees the values they copied, which is why the default needs
no decision from them.

**Paste Special (`Ctrl/Cmd+Shift+V`) offers the variants the destination can
actually honor**, and lists only those:

| Variant                    | Same project | Other project     | Result                            |
| -------------------------- | ------------ | ----------------- | --------------------------------- |
| Another view               | ✅ default   | ✗ impossible (§1) | second host, one database         |
| Independent copy with data | ✅ new       | ✅ default        | fresh table, rows copied once     |
| Independent copy, no data  | ✅ new       | ✅ new            | fresh table, schema + UI, no rows |
| Values only                | ✅ new       | ✅ new            | plain items / text, no table      |

Note what moved: "no data" is no longer the cross-project default, it is the
opt-out — the variant for someone who wants the table as a _template_. That is a
real want, and it is now stated as one instead of being imposed on everybody.

An unavailable variant is shown disabled with its reason, not hidden: "Another
view — the source table belongs to another project" teaches the model in §1
better than any documentation does.

### 5.1 The data must not travel through the clipboard

This section now governs the _default_ cross-project paste, not an opt-in
variant, so its failure modes are on everybody's path.

The tempting implementation — serialize Data Storage into the payload — should
be rejected:

- **Size.** The payload rides in `text/html` as base64 (`structuredClipboardHtml`),
  so every byte is inflated and copied into every system clipboard the user
  touches. A table of any real size makes ordinary text copies expensive.
- **Leakage.** That base64 travels into whatever app the user next pastes into.
  Copying a Grid must not deposit an entire database into a chat message.

Instead, keep the clipboard carrying **references and portable structure only**,
which is what it carries today, and resolve rows at paste time from the live
source: the payload already names `sourceProjectId` and `sourceTableId`, so the
paste loads that project's table subdoc — through the same permission path as
opening the project — and copies Data Storage into the freshly created
destination table.

This is also what keeps the promise honest at the size where it would otherwise
break. The external representation in §7 has to be capped, because a system
clipboard is a bad place for a hundred thousand rows. A paste that reads the
source subdoc directly has no such ceiling: the cross-project clone carries the
whole table however large it is, and the cap in §7 stays confined to the one
destination that cannot do better.

This inherits the right failure modes for free. The source is unreachable —
the user lost access, or is on another device where the project is not
available — → the paste completes as a structure-only clone and says so. Access
is enforced by the room, not by whoever holds the clipboard string. And the copy
is a one-time snapshot at paste time, not a live link — which is the whole
meaning of "independent copy".

**Reachability is the only discriminator, and an empty source is a success.** A
reachable table holding zero rows is a complete zero-row copy, reported as an
ordinary success — not a degradation. Emptied-after-copy is deliberately _not_ a
distinguishable case: the payload carries no row count or revision to compare
against, and adding one would only let the paste report a difference it cannot
act on. Under snapshot semantics the rows that exist when the user pastes are by
definition the right rows, so the two outcomes are:

| At paste time                  | Result                          | Reported as                          |
| ------------------------------ | ------------------------------- | ------------------------------------ |
| Source reachable, _n_ ≥ 0 rows | fresh table with those _n_ rows | copied with data                     |
| Source unreachable             | fresh table, structure only     | copied without data, with the reason |

## 6. Answer to Q3 — the two cases, in full

### 6.1 Within one project

The binding is portable, so the default is a second live view: same `tableId`,
same rows, edits in either grid visible in both. This already works and should
not change.

What is missing is the fork: Paste Special → "Independent copy with data", the
same operation §6.2 performs by default, aimed back at the project it came
from. Within a project it is the cheapest variant to build, because the source
table is in the same doc the paste is writing to — the rows need no
cross-project load and raise no permission question — and
`importTableStructures` already does every hard part (SQL name conflict
rewriting, dependency grouping, PGlite validation, atomic group commit). A
same-project clone is that function applied with the source project as the
destination, plus the row copy.

### 6.2 Across projects

An independent clone, populated, built from the **transitive closure** of what
the copied Grid needs.

**Everything the query reaches comes along — structure and rows.** A Grid's
query may join several tables, and each of those tables' own queries may reach
further. The set to clone is therefore the closure of the dependency graph
rooted at the copied hosts, not just the tables the user visibly selected. This
replaces a hard edge in today's behavior rather than only adding to it: at
present, `rewriteTableQuerySql` reports the dependencies it finds, and any
dependency whose table was not itself copied fails the whole group with "query
depends on source relation … that is absent from the clipboard". So copying one
Grid that joins two tables fails today unless the user happened to also select
the other table's host. Under the closure rule it succeeds, because the
dependency is collected whether or not a host for it was in the selection.

The closure is computed at copy time for structure — `listTables` maps a
dependency's SQL name back to its `tableId`, and `exportTableStructures` already
takes an arbitrary id set — and resolved at paste time for rows, per §5.1.

**Rows mean the whole table, not the visible result.** The clone copies each
dependency's Data Storage, not the rows the query returned. Copying only the
result would mean inventing a schema for it, and the moment the query aggregates
or joins, the pasted grid could not re-run its own query. Copying the underlying
tables lets the destination re-run the original query and reach the original
numbers, which is the actual promise. ("Give me just the result, flattened" is a
legitimate but different want; it is the "Values only" variant in §5.)

**The user should be told what came along.** A closure can be much larger than
the selection, and the destination may be shared with people the source project
is not — pasting is the user's decision to make, exactly as pasting into another
app is, but it must not be an invisible one. §6.3.

Three further semantics, none of them obvious to the user pasting:

**Reserved relations rebind, and this is the one place the values change.**
`outline_items` is in
`RESERVED_RELATION_NAMES`, so `rewriteTableQuerySql` neither rewrites it nor
records it as a clipboard dependency
(`client/src/services/yjstable/tableSqlRewrite.ts:410`). A query over
`outline_items` therefore clones successfully and then reads the _destination_
project's items. This is the correct meaning — the relation is a system-defined
projection of whatever project it is evaluated in, so a task view pasted into
another project should show that project's tasks — and it cannot be otherwise,
since the relation is not a table and has no Data Storage to bring along.

It is therefore the single exception to the rule at the top of this document.
Everywhere else the pasted Grid shows the values that were copied; a Grid
reading `outline_items` shows the destination's items instead, and a user who
copied a filled dashboard and received a filled _different_ dashboard has to be
told which relations rebound. This is not a defect to fix — the alternative
would be cloning the source project's outline into the destination — but it is
the one case where the report in §6.3 is mandatory rather than merely good
manners.

**Groups still succeed or fail together.** Dependency groups are validated in
PGlite and committed atomically, so a group whose SQL does not survive rewriting
is skipped whole while independent groups still land. With the closure rule the
common cause of failure — a dependency that was never copied — is gone, but
partial success remains a normal outcome and its report has to name what did not
make it.

**Names are rewritten, not preserved.** A destination that already has `sales`
receives `sales_2` (`deriveSqlName`), and the clone's own query is rewritten to
match. The display name is kept as-is, so two tables can present the same name
over different SQL relations — acceptable, but the rename should be surfaced
rather than discovered later in a query editor.

### 6.3 Reporting, in both cases

Every outcome above needs to reach the user at paste time; today they are all
silent. One transient summary on the paste covers them:

- `Q3 report` pasted as an independent copy, with 1,240 rows
- also copied 3 tables its query depends on: `sales`, `regions`, `fx_rates`
- `sales` was renamed to `sales_2` in this project
- `Headcount` was pasted without its rows: the source project is not available
- `Open tasks` now reads this project's outline items

The second and last lines are the ones that earn this feature. A closure paste
creates tables the user did not select, and a rebound `outline_items` changes
the numbers under a grid that otherwise looks identical — both are correct
behavior that is indefensible if it happens silently.

## 7. Answer to Q4 — outside the app, a Grid is its rendered result

Today a Grid host item contributes its display name to `text/plain`, because a
host item's own text is empty and `fallbackText` is the table name
(`client/src/lib/KeyEventHandler.ts:66`). Pasting a Grid into a spreadsheet
yields one word. That is not a degraded copy of the view; it is a copy of the
view's label.

The external representation should be **what the user sees**: the current query
result, with the view's column order, column labels and hidden columns applied —
the same list `TableGrid.svelte` renders through `effectiveColumns`.

- **`text/plain`: TSV.** Header row of the visible column labels, then one line
  per row, tab-separated, with cells quoted per §7.1. This is the universal
  spreadsheet contract: Excel, Google Sheets and Numbers all split it into cells.
- **`text/html`: a real `<table>`.** Word, Google Docs, Notion and Excel all
  prefer the HTML flavor and render it as a table with its header row. The
  existing hidden `data-outliner-items` span stays in the same fragment
  (`structuredClipboardHtml`), so in-app fidelity is untouched — Outliner reads
  the span, everyone else reads the table.
- **`OUTLINER_ITEMS_MIME`: unchanged.** Bindings and portable structure, as today.

### 7.1 Cell serialization

A cell's rendered text may itself contain a tab or a newline. Joining raw values
with tabs and newlines would turn one such value into extra cells or extra rows —
a corrupted paste that looks like valid data, which is the worst failure mode
available here. Both flavors therefore need an explicit rule.

**TSV.** Quote per RFC 4180 with tab as the delimiter: a cell containing a tab,
CR, LF or a double quote is wrapped in double quotes and its own double quotes
are doubled; every other cell is emitted raw. Excel and Google Sheets both honor
this on paste, including a quoted cell spanning several lines. Column labels in
the header row are quoted by the same rule — a label is user-supplied text and
can contain the same characters.

**HTML.** Cell boundaries are elements, so delimiters need no quoting; `&`, `<`
and `>` are escaped and a newline inside a cell becomes `<br>`, matching how the
grid renders it.

**Null.** SQL `NULL` and the empty string are different values that a TSV cannot
tell apart. Emit both as an empty cell and accept the ambiguity: the alternative
is a sentinel that pastes into a spreadsheet as a literal word. This is a
one-way, lossy export — §10.3 keeps the round trip out of scope, so nothing later
has to invert it.

Three further consequences to settle:

**Mixed selections.** A selection of three text items and a Grid produces three
lines and then the grid's rows. In `text/html` the text items are `<span>`s and
the Grid is a `<table>`; in `text/plain` the TSV block sits between the text
lines. This is what pasting a document into a document should do.

**The result may not be available synchronously.** `handleCopy` writes through
`event.clipboardData.setData` during the event, but the async path
(`writeStructuredSystemClipboard` → `navigator.clipboard.write`) already exists
and can await a query. Rule: if a rendered result is already materialized for
that table, serialize it; otherwise fall back to today's display-name text
rather than blocking the copy. A collapsed or never-rendered Grid copying as its
name is an acceptable floor.

**Size.** A result of a hundred thousand rows must not be serialized into the
system clipboard. Cap the external representation (a few thousand rows is well
past any paste target's comfort), and when the cap trims the result, say so in
the copy confirmation — never truncate silently, since a spreadsheet full of
plausible-looking rows that is missing the tail is worse than an obvious refusal.

Note that this is strictly the _outward_ direction. Text arriving from outside
keeps today's behavior: TSV pasted into an outline is text
(`FTR-b6ebf516`). "Paste a spreadsheet as a new Grid" is a separate feature with
its own schema-inference question, and §10.3.

## 8. The same rule, for Calendar and Chart

The rule generalizes, but only because the unit it is applied to is not the
block type. **The decision is made per relation, not per block.** A relation
with Data Storage of its own travels; `outline_items` rebinds; a block is
whatever set of relations its query reaches, rendered on some axis. Grid,
Chart and Calendar differ in how they draw, not in what they own.

| Block    | Its own data                | Cross-project paste                              |
| -------- | --------------------------- | ------------------------------------------------ |
| Grid     | Data Storage, in a subdoc   | structure + closure cloned, with rows            |
| Chart    | none — a view of the result | exactly what its Grid does                       |
| Calendar | none — settings only        | settings cloned; the rows follow their relations |

### 8.1 Chart — the same object, with one new question outward

`TableChartPanel.svelte` is a view over the same query result inside the same
`yjstable` block, toggled in parallel with the grid. It is not a host type: no
item points at a chart. So there is nothing to decide for the in-app direction —
copying a host whose chart view happens to be open copies that host, its
binding, and its closure, identically to copying it in grid view.

The one new question is outward. For a Grid the appearance is a table of cells;
for a chart the appearance is a picture. Both belong on the clipboard, in one
write:

- `text/plain` — the TSV of §7. A spreadsheet takes this and gets the numbers.
- `text/html` — the `<table>` of §7 **plus** an `<img src="data:image/png;…">`
  from the chart. Google Docs, Word and Slack take this and get the picture.
- `image/png` — the same PNG as its own flavor, from ECharts `getDataURL()`, for
  destinations that accept only an image.

The destination picks its flavor; carrying several is what the clipboard is for,
and it removes the need to ask the user whether they meant "the chart" or "the
data". Two caveats: a PNG data URI is large, so the §7 size rule governs it too,
and if the chart has not rendered there is no image — fall back to the table
flavors, never to the display name.

### 8.2 Calendar — no data of its own, so the rule resolves elsewhere

From the header of `client/src/services/calendar/calendarService.ts`:

> A calendar has a query and view settings and no data of its own, so unlike a
> table it needs no subdoc: a flat `calendars` Y.Map on the project doc.

Two consequences, and they point in opposite directions from today's behavior.

**Cloning a calendar is easier than cloning a Grid, not harder.** §1's
impossibility does not apply to it: there is no room derived from the project
guid, because there is no room. Calendar settings are the most portable object
in this document — a small flat map of a query, a view type, four role columns,
grouping axes and lane order, copied key by key. Today's cross-project behavior
degrades a calendar to readable text (`CLP-4584c0de`), which was a reasonable
place to stop when the surrounding question was unanswered and is not one now.
§10.4 is retired accordingly.

**Its values were never its own, so they arrive by §6.2 and not by copying.**
The calendar renders whatever its query returns, and that splits exactly along
the line §6.2 already draws:

- entries backed by a **table** travel — the table is in the closure, and its
  rows are cloned;
- entries backed by **`outline_items`** rebind, because the relation is a
  projection of the destination project's own items;
- a query reading both produces a calendar that is half copied and half local,
  and the report has to say which half is which.

So a week view of tasks, pasted into another project, shows _that project's_
tasks. That is not a compromise — it is what someone pasting "my week view" into
another project is asking for. The `outline_items` paragraph in §6.2 is a
footnote for Grids and the main event for Calendars, and the rule at the top of
this document is unchanged in both: what varies is which relation the values
were living in all along.

## 9. Open decisions

These are consequences of §4–§8 that are not yet decided. Each carries a
recommendation, but none should be treated as settled by this document.

**9.1 What does undo of a paste undo?** A cross-project paste now writes the
pasted items, the destination table registry, N new subdocs, and their rows. The
global undo stack delegates to the scope an operation was applied to
(`client/src/services/undo/undoRouter.svelte.ts`), and a paste is now several
scopes at once. Recommendation: one paste is one undoable unit, and undoing it
removes the tables it created — by construction nothing else references them
yet. The open part is what happens when the user edited the pasted grid before
pressing undo; the safe reading is that the edit is undone first, as its own
step, and the paste is only reachable underneath it.

**9.2 Schedule rules do not travel, and the clone will look broken.** A schedule
rule is `{ targetTableId, sql, rrule, … }` in the project's `schedules` map, and
the server scheduler writes its output into that table's Data Storage. Clone a
table whose rows are generated by a rule and the destination gets a full,
correct snapshot that then never grows again. The demo's own Recurring Tasks
page is exactly this shape — `routine_templates` feeding `routine_occurrences`
(`docs/schedule-sql-conventions.md`). Recommendation: do not clone schedule
rules — a paste must not start writing to a project's data on a timer the user
did not ask for — and report the omission by name, which turns a silent freeze
into a one-line instruction to recreate the rule.

**9.3 Should a repeat paste clone again, or reuse the previous clone?** Pasting
the same clipboard into the same destination twice currently yields two
independent tables holding two snapshots taken at different moments.
Recommendation: record the provenance (source project guid + source table id) on
each cloned table, and let a later paste into the same destination offer to bind
to the copy that already exists instead of making another. The provenance is
worth storing regardless — it is the only way the destination can ever say where
a table came from — and the "Existing Table" tab in `YjsTableBlock.svelte`
already establishes the interaction.

**9.4 What does cut across projects leave behind?** Cut removes the view, never
the database (§2), so cutting a Grid and pasting it into another project leaves
an orphaned table in the source and copies its rows into the destination. That
is defensible — the table may still be referenced from `/tables/…` or by another
host — but it is not obviously what "cut" promised. Recommendation: keep the
behavior and report it; deleting a table because its last view moved is
destructive in the way `docs/NON_GOALS.md` avoids elsewhere.

**9.5 A destination the user cannot write.** Undecided today and now more
visible, since a paste creates tables rather than only items. The paste should
fail as a whole, before creating anything, with a reason.

**9.6 A long paste needs progress, cancellation and a rollback guarantee.**
Cloning a closure with rows can take real time. One guarantee already exists —
navigating away mid-paste removes the tables that were created
(`KeyEventHandler.ts:2688`) — and it now has to cover rows and multiple tables,
and to be visible while it runs rather than only correct after the fact.

## 10. Explicitly out of scope

**10.1 Per-view configuration.** Column order, labels and visibility live in the
table's UI Definition, so two views of one table cannot differ. Making the view
copy meaningfully distinct from the database copy on the _presentation_ axis
requires moving that state onto the host item, which is a larger change to the
table model and not part of this spec. Until then, "another view" and "the same
grid again" are the same thing.

**10.2 Cross-project shared tables.** §1. Not a missing feature and not on the
roadmap: a deliberate consequence of deriving the table room from the project
room, and it would have to answer who may read the shared room before it could
be designed at all. Note that §4 does not soften this — a populated clone is the
opposite of sharing. The rows are copied once, at paste time, and the two tables
diverge from that instant.

**10.3 Importing external tabular data as a Grid.** Pasting TSV or an HTML
`<table>` from another app and inferring a schema is a real feature and a
different one.

**10.4 Calendar structure cloning — retired, no longer out of scope.** This
entry recorded that a cross-project Calendar paste degrades to readable text
(`CLP-4584c0de`). §8.2 supersedes it: a calendar is settings only, and settings
clone trivially. Same-project Calendar paste keeps its shared binding, as
before.

## 11. If this is implemented

The two default-path defects first — a wrong default is worse than a missing
gesture, because nobody opts into it:

1. **§4 and §5.1, the populated cross-project clone.** The headline correction:
   a cross-project paste stops arriving empty. Tests: rows present and equal to
   the source after a cross-project paste; the two tables independent afterwards
   (an edit on either side is invisible to the other); a reachable but empty
   source reported as a successful zero-row copy rather than a degradation; an
   unreachable source degrading to structure-only with a message; no row data
   present in any clipboard MIME type at any size.
2. **§6.2, the dependency closure.** Tests: copying one Grid whose query joins a
   table the user did not select clones both, with rows — the case that fails
   outright today; a chain three tables deep; a query over `outline_items`
   cloning without it and rebinding to the destination.
3. **§7, the external representation.** No data model change, no new gesture,
   and it fixes the most visible defect at the outer boundary. Tests: a TSV
   `text/plain` and an HTML `<table>` for a copied Grid, honoring hidden columns
   and column order; the §7.1 quoting rule, for a cell and a column label each
   containing a tab, a newline and a double quote, asserted to survive as one
   cell; a null and an empty string both emitting an empty cell; the
   unmaterialized fallback; a mixed text + Grid selection.
4. **§6.3, paste-time reporting.** Some of the information already exists —
   `TableCloneResult.failures` is computed and discarded at
   `KeyEventHandler.ts:2686`. Tests: a closure that pulled in unselected tables,
   a rename, a failed group, and a rebound `outline_items` each reach the user.
5. **§8.2, the Calendar clone.** Small once §6.2 exists, since a calendar is
   settings only. Tests: a cross-project Calendar paste reproducing query, view
   type, roles, grouping axes and lane order; its table-backed entries carrying
   their rows; its `outline_items` entries showing the destination's items; a
   mixed calendar reporting which half rebound.
6. **§8.1, the Chart flavors.** Tests: a copied chart writing TSV, an HTML
   fragment containing both a `<table>` and an `<img>`, and a standalone
   `image/png`; an unrendered chart falling back to the table flavors.
7. **§5, Paste Special.** New gesture, new menu, variant availability per
   destination. By this point every variant's machinery exists and only the
   choice is missing. Tests: each cell of the §5 matrix, including the disabled
   variants and their reasons.

§9 must be answered before 1 ships, not after: undo (§9.1) and the unwritable
destination (§9.5) are correctness, and the schedule-rule omission (§9.2) is a
report the first populated clone already needs.

Every acceptance line above belongs in
`docs/client-features/clp-component-block-clipboard-4584c0de.yaml`, and the
demo project must show whichever of these ships
(`docs/demo-project.md`).
