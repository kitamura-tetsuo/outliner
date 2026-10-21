# Grid clipboard and transfer behavior

## Scope

Make view dependency and transfer behavior follow SQL references instead of primary-Table ownership.

A Grid is a Project-scoped definition identified by `gridId`. It owns its query,
name, column order, component types, labels, visibility, widths, Add row setting,
row-delete confirmation and optional explicit `insertTargetTableId`. A Page or
Layout placement owns its Item identity and a `yjsGridId` binding. Several
placements can share one Grid; several independent Grids can read the same Table.

A Table owns schema and records in a Project-scoped subdocument. Its
`sourceProjectId`/`sourceTableId` copy provenance remains supported. Schedule
`targetTableId` also remains supported. Neither establishes Grid ownership.
Current Grid definitions and placements carry no primary Table metadata.

## Read dependencies and deletion

Stored SQL is parsed without mounting the view or successfully executing its
query. Relation references, including nested EXISTS reads, resolve through the
source Project's current Table registry. Aliases, column names, source_kind
literals and INSERT preferences do not establish read dependencies.

Inventory distinguishes complete reads (including `SELECT 1` with no user
Tables) from unknown analysis and missing/ambiguous relations. CTE scope and
function relations currently report unknown rather than certify an empty read
set. Partial related selection is reported as partial. Automatic clipboard
capture refuses incomplete dependency evidence before clipboard or document
changes; it does not silently transfer a partial closure.

Both Table deletion policies preserve every Grid/Kanban definition and every
Page/Layout placement. Surviving queries report broken SQL; saved INSERT
preferences remain stored and diagnosable even when their Table disappears.
The remove-direct-references policy still removes Schedules directly targeting
the Table. SQL-only Schedule reads retain their existing warning behavior.
Table deletion confirmation refreshes impact, reports unknown analysis as
uncertainty, and checks the current Project and Table incarnation after awaits.
Table Undo owns Table/Schedule effects and never restores old view snapshots.

Explicit Grid/Kanban object deletion retains its placement confirmation and
removal behavior. Placement-only removal leaves its view definition and source
records. Grid deletion Undo does not overwrite a placement rebound to another
view and restores the Grid's saved presentation settings and retained copy
provenance. Later ordinary Paste reuses that restored Grid; independent Grid
duplication does not inherit its copy provenance. Restoration creates a new
entry incarnation and does not revive an older transfer's ownership witness.

## Operation matrix

| Operation                             | Placement                               | Grid                                                                     | Tables and records                                                                                   |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Ordinary same-Project Copy/Paste      | New Item ID                             | Same Grid ID                                                             | Shared existing records                                                                              |
| Same-Project Another view             | New Item ID                             | Same Grid ID                                                             | Shared existing records                                                                              |
| Independent Grid duplication          | Operation's new placement, if requested | New Grid ID                                                              | Only the actual selected scope; chosen data mode                                                     |
| Object Manager Duplicate selected     | Only explicitly requested placement     | New IDs for exactly the selected definitions                             | Exact selection, including filtered-out selections                                                   |
| Ordinary cross-Project Copy/Paste     | New Item ID                             | Independent destination definition; repeat reuse by source view identity | Independent destination storage; current rows fetched at paste time; Table provenance reuse retained |
| Explicit independent repeat paste     | New Item ID                             | Fresh Grid ID                                                            | Fresh selected storage, with/without data as chosen                                                  |
| Values only                           | Ordinary text/cells                     | No structural binding                                                    | No structural copy                                                                                   |
| Same-Project Cut/Paste                | Original Item IDs                       | Existing Grid ID                                                         | Existing records                                                                                     |
| Cross-Project Cut/Paste               | Original Item IDs                       | Original ID value in an independent destination definition               | Actual copy/reuse map; source Tables and records retained                                            |
| Kanban-containing structural transfer | Refused                                 | Refused                                                                  | No effects; ordinary card-text Copy remains supported                                                |

Select related expands selection separately from Duplicate selected. Copying a
Table alone does not create an extra Grid. A dependency-free or system-relation
Grid is portable with zero Table snapshots. Cell TSV copying keeps its separate
physical-source admission rules.

## Portable format and identity maps

The private `application/x-outliner-items` payload and its HTML-embedded form
carry placements by `yjsGridId`. Independent `grids` snapshots are keyed by
source Grid ID and carry the definition plus resolved read Table IDs. `tables`
snapshots are keyed by Table ID and contain schema, names and SQL catalog
evidence, never row data or an embedded Grid UI slice. Tables and Grids are
deduplicated independently.

Import maintains separate source-Table-to-destination-Table,
source-Grid-to-destination-Grid and SQL-name maps. Relation SQL and source_kind
routing literals are rewritten using the actual copied/reused Table map. A
same-named destination Table is not evidence for an omitted source dependency.

An explicitly saved INSERT preference maps through that same Table identity
map. Same-Project references outside the copy retain their original IDs,
including a stale saved preference. Cross-Project unmappable preferences are
cleared with an omission diagnostic. Invalid preferences never expand scope.
Automatic targets are recomputed, never serialized as user choices.

For explicit cross-Project copies omitting required query dependencies, the
copied query is unavailable/cleared and the omission is reported. An unreachable
row source retains the existing structure-only fallback with a diagnostic; a
reachable source with zero rows is successful empty data. Copied Schedule rules
remain disabled. Their SQL follows both fresh and reused Table identity/name
mappings, while only freshly copied targets receive copied rules. Structure-only
transfers still copy no Schedule rules or rows. Reusing a Table does not choose an arbitrary first Grid or
overwrite a previously reused Grid's settings.

The external text/plain flavor is rendered TSV; text/html contains a real
rendered table plus the private payload; existing chart image and size-limit
behavior remains. Structural transfers are not an archival Markdown/OPML format.
Old primary-bearing transport formats have no compatibility adapter.

## Cross-Project Cut clarification (REQ-006; acceptance under REQ-008)

A staged Cut changes no source document. Source binding/query/dependency facts,
access, destination legality, allocated Table names and collisions are checked
again after asynchronous preparation and immediately before shared mutation.
Grid preparation uses private storage, not tentative edits to either Project.

Each selected placement retains its original ID. Shared incoming Grids are
deduplicated: two selected placements of G create one destination G. The source
Grid and settings remain unchanged even when its last placement moves. Other
source placements retain their IDs and bindings.

Identity is Project-scoped: `(sourceProjectId, gridId)` and
`(destinationProjectId, gridId)` have the same ID value but independent SQL,
settings and storage. SQL and explicit preferences use the actual Table map.

Any existing destination Grid ID or placement ID refuses the entire move,
including an identical definition or a prior transfer. Placement checks cover
the entire destination tree identity namespace, not only the target Page.
Refusal leaves both Projects, history and the clipboard unchanged relative to
the paste attempt, and does not consume the staged Cut.

Consequently, a later move of another placement of G into a Project already
containing G is refused. A fresh Cut back into the original Project is also
refused while the retained source G exists. There is no implicit merge/reuse of
Grid definitions for cross-Project Cut.

Undo of the original move is separate from fresh Paste. It restores placement
IDs against the current surviving source Grid without replaying a source Grid
snapshot. Cleanup owns only objects created by that transfer. Replay checks
identities, locations and relevant owned state; a conflict preserves peer state
and leaves history at its existing position. Successful Redo retains IDs and
revalidates destination collisions. Consuming the Cut is not reversed by Undo.

Delayed transfers validate live registry incarnations and SQL names after asynchronous preparation. A provenance-reused Table that is deleted or replaced refuses the transfer rather than falling back to a same-named relation. Mixed Diagram/Grid Copy admits its shared Grid references before allocating independent Diagram snapshots. Cross-Project Cut revalidates the staged structural transfer at the final commit boundary.

Duplication history validates all created object incarnations and destination placements before Undo, and the destination Page before Redo. A refused replay preserves peer replacements and history position; successful Redo refreshes the creation witnesses for the new incarnation.

Ordinary cross-Project Copy/Paste keeps transient witnesses for the destination
Table, Grid and Schedule entries produced or reused by that attempt. Delayed
source acquisition, source disposal and later Calendar preparation do not
permit a deleted, replaced or rebound destination to receive a placement.
Final admission runs immediately before placement dispatch; refusal removes
only still-owned allocations and reports no successful paste or history entry.
Source-unavailable structure-only fallback still requires valid bindings.

Composite Paste Undo validates the complete owned set before changing either
the outline or dependent objects. A missing/replaced incarnation refuses the
whole Undo without advancing either history stack. Redo checks saved Table
SQL names as well as destination IDs and reused dependencies before restoring
anything. A collision preserves peer data and history position; removing the
collision allows the same history entry to retry. Successful Redo refreshes
ownership witnesses. A Paste that reuses every Table and Grid retains the same
destination-binding replay checks: Undo removes only its placement, and Redo
requires unchanged reused bindings without requiring the source Project to
remain loaded. Definition recreation retains the admitted Table schemas, Grid queries and
portable catalog (including a query-only Grid's top-level catalog) for synchronous
ENUM compatibility checks against the current destination. Required type uses
come from parsed SQL type references, so an ENUM name in a literal/comment is
not a dependency. Catalog-independent
copies replay without a loaded source. Replaying saved rows/settings never
reconnects to recopy newer source data.
An importer-wide admission failure also cleans up earlier
successful groups, while preserving peer replacements and recoverable
per-group SQL validation behavior.

Values only uses the captured outward text even if its source Grid has since
been removed. Structural choices, including Another view, still validate the
original source binding and query across the chooser; choosing a variant does
not recapture stale authority.

A successfully acquired cross-Project row source remains connected through the
prepared transfer's final placement admission. Its captured Grid incarnation,
query, explicit INSERT preference and resolved Table identities/SQL names must
still match the clipboard plan; a newer live query cannot authorize older
clipboard SQL. Selected Table entries/subdocuments are also rechecked. Peer row
and presentation edits do not invalidate this structural evidence. Refusal
cleans only still-owned destination allocations and creates no placement,
history or success report. Completion, discard and failed preparation release
only the operation's own lease, once. Temporary source reads do not bind source
cursors into the destination editor. Unavailable acquisition retains the
structure-only fallback, including a cold Project room whose initial sync times
out: its newly opened client is released and is not evidence of Grid deletion.
Already-loaded shared clients retain their existing acquisition behavior.
Explicit no-data Copy opens no new source room.

Same-Project ordinary Paste and Another view retain non-owned Grid and dependency
Table witnesses in an isolated placement history entry. Undo removes placements
without deleting shared definitions or records. Redo requires the original Grid
and Table incarnations, query, INSERT preference and resolved dependencies;
refusal changes neither native nor router history, clipboard bytes or peer data.
Presentation and row edits remain independent.

No-data cross-Project Copy uses an already-loaded authorized source as identity
evidence without opening a source connection or reading rows. Evidence is
captured before asynchronous SQL/import preparation and rechecked at final
placement admission. An observed deletion, replacement or structural change
refuses the operation; a genuinely never-loaded source retains portable
structure-only behavior. Calendar SQL uses both fresh and provenance-reused
Table mappings, resolved through admitted destination identities. Reuse grants
no allocation ownership and causes no row or Schedule recopy.
