# Grid copy and paste: view, database, and the world outside

Status: §1–§3 describe implemented behavior
(`docs/client-features/clp-component-block-clipboard-4584c0de.yaml`). §4–§8 are
a proposal and are **not** implemented; they answer four open questions:

1. Is copying a Grid a copy of the _view_ or a copy of the _database_?
2. Should the user be able to choose between the two?
3. How do the answers differ within one project and across projects?
4. What should land in the clipboard when the paste target is another
   application?

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
not independently configured ones (see §8.1).

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
one-way, lossy export — §8.3 keeps the round trip out of scope, so nothing later
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
its own schema-inference question, and §8.3.

## 8. Explicitly out of scope

**8.1 Per-view configuration.** Column order, labels and visibility live in the
table's UI Definition, so two views of one table cannot differ. Making the view
copy meaningfully distinct from the database copy on the _presentation_ axis
requires moving that state onto the host item, which is a larger change to the
table model and not part of this spec. Until then, "another view" and "the same
grid again" are the same thing.

**8.2 Cross-project shared tables.** §1. Not a missing feature and not on the
roadmap: a deliberate consequence of deriving the table room from the project
room, and it would have to answer who may read the shared room before it could
be designed at all. Note that §4 does not soften this — a populated clone is the
opposite of sharing. The rows are copied once, at paste time, and the two tables
diverge from that instant.

**8.3 Importing external tabular data as a Grid.** Pasting TSV or an HTML
`<table>` from another app and inferring a schema is a real feature and a
different one.

**8.4 Calendar structure cloning.** Unchanged and still unsupported
(`CLP-4584c0de`): a same-project Calendar paste retains its binding, and a
cross-project one degrades to readable text.

## 9. If this is implemented

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
5. **§5, Paste Special.** New gesture, new menu, variant availability per
   destination. By this point every variant's machinery exists and only the
   choice is missing. Tests: each cell of the §5 matrix, including the disabled
   variants and their reasons.

Every acceptance line above belongs in
`docs/client-features/clp-component-block-clipboard-4584c0de.yaml`, and the
demo project must show whichever of these ships
(`docs/demo-project.md`).
