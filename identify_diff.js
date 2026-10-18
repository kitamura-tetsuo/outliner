const fs = require('fs');

const eng = fs.readFileSync('docs/user-manual/index.md', 'utf8');
const jap = fs.readFileSync('docs/ja/user-manual/index.md', 'utf8');

// I need to find the missing parts according to the task description.
// Wait, the task says:
// 1. Observe and Understand the Current State
// - actually access demo environment to explore and understand current UI, features and operational specifications.
// - compare the actual behavior of demo environment with existing documentation to identify any discrepancies, missing information, or outdated content.
// Demo env has:
// 1. "Object Manager: open it from the sidebar to browse every Grid, Calendar, Table and Schedule in this project."
// But the docs currently say "Grid, Table and Schedule". Kanban was added? No, the demo screenshot shows:
// "Object Manager: open it from the sidebar to browse every Grid, Calendar, Table and Schedule in this project. Each Grid/Calendar row lists the Pages it is directly placed on — click one to jump straight to that block. Click a name to rename it in place; select several objects and use the compact toolbar's literal find/replace, whose before/after preview opens as a popover so the object list never shifts; delete is undoable with Ctrl/Cmd+Z. "Select related" expands the current selection over the same dependency graph duplication uses — Dependencies, Dependents, or All connected — so selecting one Table and choosing Dependents adds every Grid, Schedule and Calendar that reads it. "Duplicate selected" then copies exactly that checked set — never a recomputed scope — into this or another project, with the same undo/redo as the rest of the toolbar; an individual Grid/Table/Schedule/Calendar page's own Duplicate button opens Object Manager with it preselected instead of asking for a scope itself. Use "Place on Page…" or drag a Grid/Calendar row onto a sidebar Page to add another placement of that existing object without duplicating its definition."

// Let's update the docs to include Calendar and Kanban where appropriate.
// The demo text explicitly added Kanban and Calendar to various lists.
