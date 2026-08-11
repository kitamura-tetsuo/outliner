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

> **Copying inward carries meaning; copying outward carries appearance.**
> Inside Outliner a Grid copy is a copy of the _view_, and the database follows
> only when the view cannot reach the original. Outside Outliner a Grid copy is
> the rendered result — a table of cells, not a reference to anything.

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
reason in §1, so structure-only is the honest maximum.

Thin, and the subject of the rest of this document:

- **The mode is chosen by the destination, never by the user.** Duplicating a
  table to fork it — same schema, same query, own rows — is a real need with no
  gesture at all today. Neither is carrying rows across projects.
- **Empty is a decision presented as a fact.** A cross-project paste silently
  produces an empty grid. Nothing says the rows were dropped rather than lost.
- **The external representation is close to useless.** A user looking at 200
  rows of numbers copies them and gets the word `Sales`. §7.

## 4. Answer to Q1 — it is a view copy, and it should stay one

The default must remain the view: copy the item, keep it pointing at the same
database when it can, and clone the database only when the pointer cannot
survive the trip. Two reasons beyond §3.

**The database is not inside the view.** The grid on screen is one query result
over a relation that may join several tables and the reserved `outline_items`
relation. "Copy this Grid's database" is not a well-formed instruction whenever
the query spans more than one relation, and it never means "copy what I can
see". Copying the view is the only interpretation that is always well-formed.

**The gesture is an outliner gesture.** A Grid is copied by selecting lines of
an outline, along with the text items around it. The selection means "these
blocks of my document", and every other block in that selection copies its
appearance and its identity, not the storage behind it.

Where the pointer cannot survive — a different project — the fallback ranking
is: clone the structure (today), then degrade to readable text (today), and
never invent a shared binding across projects.

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

**Default paste (`Ctrl/Cmd+V`) keeps today's rule** and gains nothing to
configure: same project → another view; other project → independent clone.

**Paste Special (`Ctrl/Cmd+Shift+V`) offers the variants the destination can
actually honor**, and lists only those:

| Variant                      | Same project | Other project                 | Result                            |
| ---------------------------- | ------------ | ----------------------------- | --------------------------------- |
| Another view                 | ✅ default   | ✗ impossible (§1)             | second host, one database         |
| Independent copy (structure) | ✅ new       | ✅ default                    | fresh table, schema + UI, no rows |
| Independent copy with data   | ✅ new       | ✅ new, source-reachable only | fresh table, rows copied once     |
| Values only                  | ✅ new       | ✅ new                        | plain items / text, no table      |

An unavailable variant is shown disabled with its reason, not hidden: "Another
view — the source table belongs to another project" teaches the model in §1
better than any documentation does.

### 5.1 "With data" must not put the data in the clipboard

The tempting implementation — serialize Data Storage into the payload — should
be rejected:

- **Size.** The payload rides in `text/html` as base64 (`structuredClipboardHtml`),
  so every byte is inflated and copied into every system clipboard the user
  touches. A table of any real size makes ordinary text copies expensive.
- **Leakage.** That base64 travels into whatever app the user next pastes into.
  Copying a Grid must not deposit an entire database into a chat message.

Instead, keep the clipboard carrying **references and portable structure only**,
which is what it carries today, and resolve rows at paste time from the live
source: the payload already names `sourceProjectId` and `sourceTableId`, so a
"with data" paste loads that project's table subdoc — through the same
permission path as opening the project — and copies Data Storage into the freshly
created destination table.

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

What is missing is the fork: Paste Special → "Independent copy". Within a
project this is the cheapest possible variant to implement, because the source
table is in the same doc the paste is writing to — no cross-project loading, no
permission question, and `importTableStructures` already does every hard part
(SQL name conflict rewriting, dependency grouping, PGlite validation, atomic
group commit). A same-project structure clone is that function applied with the
source project as the destination.

### 6.2 Across projects

Structure clones as today, with three semantics worth stating explicitly because
none of them is obvious to the user pasting:

**Reserved relations rebind, and that is intended.** `outline_items` is in
`RESERVED_RELATION_NAMES`, so `rewriteTableQuerySql` neither rewrites it nor
records it as a clipboard dependency
(`client/src/services/yjstable/tableSqlRewrite.ts:410`). A query over
`outline_items` therefore clones successfully and then reads the _destination_
project's items. This is the correct meaning — the relation is a
system-defined projection of whatever project it is evaluated in, so a task view
pasted into another project should show that project's tasks. But the numbers
change on paste, and a user who copied a filled dashboard and received a filled
_different_ dashboard deserves to be told which relations rebound.

**Copied tables that reference each other travel as a unit.** Dependency groups
succeed or fail together and a group whose query references a relation that was
not copied fails as a group. Independent groups still land. So a partial success
is a normal outcome, and its report has to name the tables that did not make it.

**Names are rewritten, not preserved.** A destination that already has `sales`
receives `sales_2` (`deriveSqlName`), and the clone's own query is rewritten to
match. The display name is kept as-is, so two tables can present the same name
over different SQL relations — acceptable, but the rename should be surfaced
rather than discovered later in a query editor.

### 6.3 Reporting, in both cases

Every non-default outcome above needs to reach the user at paste time; today
they are silent. One transient summary on the paste covers all of them:

- _n_ Grids pasted as new independent tables (rows not copied)
- `sales` was renamed to `sales_2` in this project
- `Q3 report` could not be pasted: its query depends on a table that was not
  copied
- This Grid now reads this project's outline items

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

**8.2 Cross-project shared tables.** §1. Not a missing feature; a deliberate
consequence of deriving the table room from the project room.

**8.3 Importing external tabular data as a Grid.** Pasting TSV or an HTML
`<table>` from another app and inferring a schema is a real feature and a
different one.

**8.4 Calendar structure cloning.** Unchanged and still unsupported
(`CLP-4584c0de`): a same-project Calendar paste retains its binding, and a
cross-project one degrades to readable text.

## 9. If this is implemented

Order, cheapest and most valuable first:

1. **§7, the external representation.** No data model change, no new gesture,
   and it fixes the most visible defect. Tests: a TSV `text/plain` and an HTML
   `<table>` for a copied Grid, honoring hidden columns and column order; the
   §7.1 quoting rule, for a cell and a column label each containing a tab, a
   newline and a double quote, asserted to survive as one cell; a null and an
   empty string both emitting an empty cell; the unmaterialized fallback; a mixed
   text + Grid selection.
2. **§6.3, paste-time reporting.** The information already exists —
   `TableCloneResult.failures` is computed and discarded at
   `KeyEventHandler.ts:2686`. Tests: a rename, a failed dependency group, and a
   rebound `outline_items` each reach the user.
3. **§5, Paste Special.** New gesture, new menu, variant availability per
   destination. Tests: each cell of the §5 matrix, including the disabled
   variants and their reasons.
4. **§5.1, "with data".** Depends on 3. Tests: rows copied once and then
   independent; a reachable but empty source reported as a successful zero-row
   copy, not as a degradation; an unreachable source degrading to structure-only
   with a message; no row data present in any clipboard MIME type.

Every acceptance line above belongs in
`docs/client-features/clp-component-block-clipboard-4584c0de.yaml`, and the
demo project must show whichever of these ships
(`docs/demo-project.md`).
