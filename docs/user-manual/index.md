# Outliner User Manual

Welcome to the Outliner user manual. This guide provides human-readable instructions on how to use Outliner, from basic navigation to advanced features.

## Table of Contents

1. [Basic Operations](#basic-operations)
2. [Text Editing and Formatting](#text-editing-and-formatting)
3. [Item Manipulation](#item-manipulation)
4. [Undo and Redo](#undo-and-redo)
5. [Links](#links)
6. [Search and Commands](#search-and-commands)
7. [Selection and Clipboard](#selection-and-clipboard)
8. [Attachments](#attachments)
9. [Advanced Features](#advanced-features)
10. [Layouts](#layouts)
11. [Database Tables](#database-tables)
12. [Calendars](#calendars)
13. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Basic Operations

An overview of the basic interface and navigation.

### Creating and Browsing Pages

You can create and browse pages using the left sidebar or the top search bar.

To browse your pages, click the sidebar toggle button in the top-left corner (hamburger menu) and expand the **Pages** section. This section lists all pages in the current project. The project homepage also displays your pages. You can toggle between grid view and list view, and sort pages by Modified, Created, Last visited, Most linked, Most viewed, or Title.

To create a new page, click the add (**+**) button in the **Pages** section header of the sidebar.

### Switching to Edit Mode

Click on any text to place your cursor there and enter edit mode.

### Moving Between Items

Use the keyboard arrow keys (`↑`, `↓`, `←`, `→`) to freely move your cursor. The cursor keeps its horizontal position when moving vertically between items.

- Move to the beginning of the line: `Home`
- Move to the end of the line: `End`

### User Authentication

The user profile button located in the top right corner of the navigation bar indicates your current login state. For guest users or when accessing a public space, it may display "Not signed in". You can click it to manage your account or sign in.

### Sidebar Navigation

Click the sidebar toggle button (hamburger menu) in the top-left corner to access the main sidebar navigation. Sections in the sidebar can be expanded or collapsed by clicking their headers. The sidebar provides quick access to:

- **Projects:** Switch between your projects or go home.
- **Pages:** Browse all pages in the current project. You can also quickly create a new page by clicking the add (+) button in the section header.
- **Tables:** View and manage database tables.
- **Scheduled SQL:** Manage automated, recurring queries. Schedules belong to the project, not to a table. You can quickly create a new schedule rule by clicking the add button in the section header.
- **Settings:** Access project configurations.
- **Docs:** Quick link to the documentation.
- **GitHub:** Quick link to the source code.

---

## Text Editing and Formatting

Outliner uses Scrapbox-style syntax for text formatting options.

### Applying Formatting

- Bold: Wrap text in double brackets `[[bold]]`
- Italic: Wrap text in a slash bracket `[/italic]`
- Strikethrough: Wrap text in a dash bracket `[-strikethrough]`
- Underline: Wrap text in `<u>` and `</u>` tags `<u>underline</u>`
- Code: Wrap inline code in backticks \`code\`
- URLs: Typed URLs automatically become clickable links
- Checkboxes: Inline checkboxes with `[ ]` for pending and `[x]` for completed tasks
- Formats can be combined, like bold with italic inside.

---

## Item Manipulation

Powerful item manipulation features expected in an outliner.

### Adding New Items

Press `Enter` to insert a new item below the current one. You can also click the **Add Item** button in the document toolbar.

### Indenting Items

- Increase indent: `Tab` to indent an item (make it a child of the item above)
- Decrease indent: `Shift + Tab` to unindent an item

### Moving Items

Easily reorder items using drag and drop. You can also use `Alt + ↑` and `Alt + ↓` to move the current item (and its children) up or down among its siblings.

---

## Undo and Redo

Undo and redo run off a single history for the whole project.

### Shortcuts

- `Ctrl+Z` undoes the most recent change.
- `Ctrl+Shift+Z` or `Ctrl+Y` redoes it.

### Toolbar buttons

The **Undo** and **Redo** buttons in the toolbar at the top of the window do exactly the same thing as the shortcuts. On a phone they sit in the action toolbar at the bottom — a software keyboard has no `Ctrl` key, so that is how you reach your history there.

Each button is greyed out while there is nothing to undo (or redo) and becomes available as soon as you make a change. Pressing one while you are editing keeps your cursor where it was and leaves the software keyboard open, so you can carry straight on typing.

The outline and every database table each keep their own change history internally, but you never have to think about which one you are in. It all acts as one stack, in order. Edit a line, then add a row to a table; undo twice and the table row goes first, then the edit. Changes made by other people editing at the same time are never undone by you.

---

## Links

Create links to other pages within Outliner or external websites.

### Internal Links

Type `[` once, then enter a page name to create a link to another page (e.g., `[page name]`).

- Links to pages that do not exist yet look different, and the page is only created once you edit it.
- You can also link to a page in another project with `[/project/page]` syntax.
- **Link Previews:** Hovering over an internal link displays a preview of the page content.
- **Backlinks:** Pages that link to the current page are listed in the backlink panel at the bottom.
- **Graph view:** The graph view visualizes how the pages of a project are connected. Click the **Graph View** button in the header of an individual page to access it.

### External Links

Paste any URL to automatically create an external link.

---

## Search and Commands

Easily find content and execute actions within Outliner.

- **Search:** Use the "Search pages" input field at the top of the screen to quickly search across the whole project. Recent searches are remembered for quick access.
- **Search and Replace:** Click the **Search** button in the page header to open the Search and Replace panel. Replace only rewrites item text; page titles stay untouched unless you tick "Include page titles". With that option on, renaming a page is confirmed first, and the open page follows its new name.
- **Command Palette:** The inline command palette opens when you type `/` inside an item. Available options include inserting a Database or an Alias.
- **Breadcrumbs:** Breadcrumbs at the top of each page let you jump back to the project or home.

---

## Selection and Clipboard

Efficiently select and copy multiple items or text ranges.

### Selecting Text

- `Shift + Arrow keys`: Select character by character or line by line. Selections can span multiple items.
- `Ctrl+L` selects the entire line under the cursor.
- `Shift+Alt+Right` expands the selection to the end of the line; `Shift+Alt+Left` shrinks it.
- `Alt+Shift+Arrow keys` (or `Alt+Shift+mouse drag`) create a box selection across items.

### Copy and Paste

- **Cross-project copy:** Copying and pasting items works smoothly even between different projects, transferring all nested content.
- **Paste Special:** Press `Ctrl/Cmd+Shift+V` for Paste Special: choose another live view, an independent copy with or without data, or plain values. Unavailable choices stay visible and explain why.

### Touch Selection (Phone or Tablet)

- Tap any character to put the caret there and open the keyboard.
- Press and hold to select the word under your finger.
- Keep your finger down and drag to extend the selection, even into the items below.
- A normal swipe still scrolls the outline as usual.

### Box Selection (Rectangle Selection)

Select a rectangular area across items.

- Mouse: `Alt + Shift + Drag`
- Keyboard: `Alt + Shift + Arrow keys`

### Actions on Selection

With an active selection you can:

- Copy and paste it, even when it spans multiple items.
- Delete the whole selection in one step.
- Drag and drop the selected text to move it.
- Apply formatting such as bold or italic to the selected range.

When a copied selection contains a component block:

- Pasting a **Grid** in the same project creates another live view of the same table and Data Storage.
- Across projects, paste instead creates an independent Grid with a fresh identity, copied schema, UI settings, and a paste-time snapshot of its rows; conflicting SQL names are rewritten.
- **Calendar** blocks retain their portable settings when pasted across projects.
- Press `Ctrl+Shift+V` (or `Cmd+Shift+V`) for Paste Special: choose another live view, an independent copy with or without data, or plain values. Unavailable choices stay visible and explain why.
- Cut and paste moves the view without deleting its data.
- When a cross-project paste has a hidden consequence—such as copying query dependencies, renaming SQL relations, rebinding outline_items, omitting schedule rules, or leaving a cut table in the source—a transient summary names exactly what happened.
- Outside Outliner the same copy pastes as what you see: a spreadsheet receives the Grid's rows as cells, a document receives them as a table, and with the Chart view open the picture travels with the numbers.

---

## Attachments

You can easily add attachments to your items.

### Uploading Attachments

You can upload attachments by dragging and dropping an image or file directly onto the editor. Alternatively, you can click the **Add Image** button in the document toolbar.

---

## Advanced Features

Outliner includes advanced capabilities like aliases and schedule rules.

- **Aggregation across tables:** Every table of a project can be referenced by the name its schema declares. You can create a table whose query joins another table (e.g., comparing targets with a Sales table).
- **Aliases:** An item can mirror another item and stay in sync with the original.
- **Schedule Rules:** Pages can be scheduled to be published at a later time. A schedule rule runs SQL on a recurrence to append data automatically (e.g., daily or weekly tasks). Rules belong to the project, not to a table: open **Scheduled SQL** in the sidebar, or the project's schedules page, to create and manage them. 'Run now', next to Edit and Delete in that list and on the Edit Schedules page, runs a rule's SQL immediately so you can try it out; it leaves the recurrence unchanged and works even while the rule is disabled.
- **Comments and Votes:** Discuss and vote on items. Items show a badge with the number of comments. Click the vote count button, or right-click and choose 'Vote for item', to show agreement.
- **Publishing and Sharing:** Pages and projects can be shared beyond the people editing them. Sharing: generate a read-only token to share a project without giving edit access. Tokens are generated in the Project Settings (accessed via 'Settings' in the sidebar). Scheduled publishing: schedule a page to be published automatically at a later time. Snapshots: the snapshot diff viewer shows how a page changed compared to earlier versions; access it via the **History / Diff** button in the document toolbar.
- **Collaboration:** Real-time editing with other users. While others type, you can see their cursors and selections.
- **Remote MCP Access:** Outliner's on-premises server exposes a read-only MCP endpoint for compatible AI clients. Paste a normal Outliner project or page URL into the client; `resolve_url` converts its human-readable titles to stable IDs. Text, Grid, Calendar, and Layout remain distinct semantic node kinds instead of being flattened into fake text. Every project read uses the signed-in user's existing project access, and large structural reads are bounded. The initial MCP tools never create, update, move, or delete Outliner data.

---

## Layouts

A Layout arranges visual blocks side by side. It is a normal outline item that owns its children through the tree — deleting, copying, or moving it behaves exactly like any other item.

- **Grid System:** The Layout is a fixed 12-column grid. Each block inside it stores only how many columns it spans (1 to 12); rows and columns follow from that span plus the block's position in the outline.
- **Tree Ordering:** Nothing else about placement is saved — no coordinates, row numbers or pixel widths — so reordering the blocks is an ordinary tree reorder and the arrangement follows.
- **Allowed Content:** Only visual blocks (Database and Calendar) may sit directly inside a Layout. Ordinary text and a Layout inside a Layout are refused, so text editing stays one-dimensional.
- **Resizing:** Drag the handle at a block's right edge to change its span a whole column at a time, or use the − / + buttons; the same control takes the arrow keys from the keyboard.
- **Stacking:** When the Layout gets too narrow for side-by-side reading, the blocks stack one per row in outline order — the stored spans stay as they are and come back with the width.
- **Removing Layout:** Right-click the Layout for "Remove layout (keep blocks)": the blocks move up to the Layout's position and the container alone is removed, unlike "Delete item", which takes the whole subtree.
- **Creation:** Type `/Layout` on an empty item to create one, then drag a Database or Calendar block onto it. An empty Layout stays where it is, ready for the next block.

## Database Tables

Create database tables to manage structured data within your project. You can start with a blank table or use presets like Tasks or Habits.

- **Task manager:** Add tasks with due dates, priorities, and repeat intervals. Status and priority options come from the schema's CHECK constraints.
- **Habit tracker:** One table holds habit definitions and daily completion logs. Add a log row for today to extend a streak.

### Creating a Database Table

Click the **Add Database** button on the left side of the top navigation bar.

A new database block will be inserted at the bottom of the current page. Within this block, you can:

- **New Table:** enter a table name, select a preset (e.g., Table, Tasks, or Habits), and click **Create**. The SQL name used in queries is generated automatically and displayed below the input fields.
- **New Grid over Existing Table:** create a new view/grid linked to an existing table's data by switching to this tab, selecting a table, and clicking **Select**.
- **Existing Grid:** embed a previously created grid by switching to this tab, selecting the grid, and clicking **Select**.

Additionally, you can view and manage your existing databases by clicking the **Databases** button on the right side of the top navigation bar, which opens a right-side drawer. This sidebar lists all your TABLES and routines/schedules (e.g., Routine Templates, Routine Occurrences).

### Managing Data

Once the table is created, you will see a grid view where you can add, edit, or delete records.

- You can toggle between different views of the table using the buttons at the top:
  - **Grid:** The default view for adding and editing data rows.
  - **Chart:** A visual representation of your data.
  - **Schema:** Allows you to define and edit the SQL schema for your table.
  - **UI:** An editor to customize how columns are displayed (e.g., as text, checkboxes, dates, or select dropdowns).
- The table toolbar also provides **Undo** and **Redo** buttons for convenience; these seamlessly integrate with the project's single global history.
- The table name in the toolbar links to the source table's own page.

### Tables, Grids and Schedules are separate

A table, a grid and a schedule are three independent things, and each has its own page.

- **Table** (`/tables/<project>/<table>`) owns the schema and the data. Its page shows the schema editor and a raw, editable view of every row — an implicit `SELECT * FROM <sql name>` that is not saved as a grid. A table is fully usable even when no grid exists over it. Below the data, the page lists the grids that select from this table and the schedules that reference it, as links.
- **Grid** (`/grids/<project>/<grid>`) owns one SELECT and its presentation: column order, labels, hidden columns, cell components and the chart. Several grids may present the same table, and each keeps its own settings; they all read and write the same table data. A grid page links back to its source table rather than owning its schema.
- **Schedule** (`/schedules/<project>`, one rule at `/schedules/<project>/<rule>`) belongs to the project. A schedule writes into a target table and its SQL may read any other table of the project, so it appears in the reference list of every table it touches and is owned by none of them.

### Collaboration

Databases are stored the same way as other outliner data, so data changes and schema updates sync live to everyone in the project.

---

## Calendars

A calendar is a query plus a role assignment over its result columns — which column is the title, the start, the all-day flag, the duration, and which columns are grouping axes. It has no data of its own.

- **Query and Roles:** Candidates for roles are the columns the query actually returns, in result order — never a fixed schema. Changing the query never discards an existing role assignment for a column that is temporarily missing.
- **Writeability:** A query must SELECT both `source_kind` and `source_id` for its rows to be writable; otherwise the calendar is read-only and says so.
- **Undo and Redo:** Reassigning a role, editing the query, or changing group axes are all undoable, on the same shared history as everything else (see Undo and Redo).
- **Views:** Switch between Day, Hour Map, Multi-day, Week, Month, and Gantt views. The Hour Map view lays time out as an hour by minute matrix instead of a vertical column. Gantt view shows one row per entry, nested by the outline's own hierarchy. A parent with dated children shows a rolled-up bar spanning from their earliest start to latest end instead of its own dates; dragging it shifts the whole subtree as one undo entry. A parent's own due date (if any) renders as a marker alongside its rolled-up bar. Axis granularity (day/week/month/quarter) is a view setting.
- **Drag and Drop:** Drag an entry to reschedule it, drag its bottom edge to resize its duration, or move it with the arrow keys — all three go through the same write path, the same writability check, and the same optimistic-placement model. Switch between Day / Hour Map / Multi-day / Week / Month / Gantt with the toolbar select. While a drag or resize is in flight, a chip near the pointer shows exactly where the entry will land — "Thu, Aug 3 09:15 – 09:45" for a move, "09:00 – 10:30 (1h30m)" for a resize, a date alone in Month and Gantt — formatted in the calendar's own timezone and snapped the same way the drop is, so the label never promises something different from what gets written.
- **Swimlanes:** Grouping by "tags" splits the week/day view into swimlanes, one per tag, and colour-codes entries in month view. Drag an entry's small handle onto another lane to replace its tag set; hold `Ctrl` (`Cmd` on macOS) while dropping to add the lane's tag instead of replacing.
- **Safe Operations:** "New entry" always asks which page to create it under — there is no implicit inbox — and offers previously used destinations first. Deleting an entry always prompts between removing it and just clearing its date, so a keystroke never silently discards writing.

---

## Keyboard Shortcuts

You can also access a complete list of shortcuts by expanding the **Keyboard & accessibility help** section in the document toolbar.

| Action                  | Windows/Linux                    | Mac                            |
| ----------------------- | -------------------------------- | ------------------------------ |
| Add new item            | `Enter`                          | `Enter`                        |
| Select entire line      | `Ctrl + L`                       | `Cmd + L`                      |
| Select to start of line | `Shift + Home`                   | `Shift + Home`                 |
| Select to end of line   | `Shift + End`                    | `Shift + End`                  |
| Box selection (Mouse)   | `Alt + Shift + Drag`             | `Option + Shift + Drag`        |
| Box selection (Key)     | `Alt + Shift + Arrow`            | `Option + Shift + Arrow`       |
| Expand selection        | `Shift + Alt + Right`            | `Shift + Option + Right`       |
| Shrink selection        | `Shift + Alt + Left`             | `Shift + Option + Left`        |
| Undo (or toolbar Undo)  | `Ctrl + Z`                       | `Cmd + Z`                      |
| Redo (or toolbar Redo)  | `Ctrl + Shift + Z` or `Ctrl + Y` | `Cmd + Shift + Z` or `Cmd + Y` |
| Move item up            | `Alt + ↑`                        | `Option + ↑`                   |
| Move item down          | `Alt + ↓`                        | `Option + ↓`                   |
| Open context menu       | `Shift + F10` or `Menu`          | `Shift + F10` or `Menu`        |
