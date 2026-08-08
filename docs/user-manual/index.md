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
10. [Database Tables](#database-tables)
11. [Calendars](#calendars)
12. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Basic Operations

An overview of the basic interface and navigation.

### Creating and Browsing Pages

You can create and browse pages using the left sidebar or the top search bar.

To browse your pages, click the sidebar toggle button in the top-left corner (hamburger menu) and expand the **Pages** section. This section lists all pages in the current project.

To create a new page, you can:

- Click the add (**+**) button in the **Pages** section header of the sidebar.
- Alternatively, use the "New page name" input field on the project homepage and click the **+ Create** button.

### Switching to Edit Mode

Click on any text to place your cursor there and enter edit mode.

### Moving Between Items

Use the keyboard arrow keys (`↑`, `↓`, `←`, `→`) to freely move your cursor.

- Move to the beginning of the line: `Home`
- Move to the end of the line: `End`

### Sidebar Navigation

Click the sidebar toggle button (hamburger menu) in the top-left corner to access the main sidebar navigation. Sections in the sidebar can be expanded or collapsed by clicking their headers. The sidebar provides quick access to:

- **Projects:** Switch between your projects or go home.
- **Pages:** Browse all pages in the current project. You can also quickly create a new page by clicking the add (+) button in the section header.
- **Tables:** View and manage database tables.
- **Scheduled SQL:** Manage automated, recurring queries. You can quickly create a new schedule rule by clicking the add button in the section header.
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
- Code: Wrap inline code in backticks \`code\`
- URLs: Typed URLs automatically become clickable links
- Checkboxes: Inline checkboxes with `[ ]` for pending and `[x]` for completed tasks
- Formats can be combined, like bold with italic inside.

---

## Item Manipulation

Powerful item manipulation features expected in an outliner.

### Adding New Items

Press `Enter` to insert a new item below the current one. Alternatively, click the **Add Item** button in the document toolbar.

### Indenting Items

- Increase indent: `Tab` at the beginning of a line
- Decrease indent: `Shift + Tab` at the beginning of a line

### Moving Items

Easily reorder items using drag and drop. You can also use `Alt + ↑` and `Alt + ↓` to move the current item (and its children) up or down among its siblings.

---

## Undo and Redo

Undo and redo run off a single history for the whole project.

### Shortcuts

- `Ctrl+Z` undoes the most recent change.
- `Ctrl+Shift+Z` or `Ctrl+Y` redoes it.

The outline and every database table each keep their own change history internally, but you never have to think about which one you are in. Changes made by other people editing at the same time are never undone by you.

---

## Links

Create links to other pages within Outliner or external websites.

### Internal Links

Type `[` once, then enter a page name to create a link to another page (e.g., `[page name]`).

- Links to pages that do not exist yet look different, and the page is only created once you edit it.
- You can also link to a page in another project with `[/project/page]` syntax.
- **Backlinks:** Pages that link to the current page are listed in the backlink panel at the bottom.
- **Graph view:** The graph view visualizes how the pages of a project are connected. Click the **Graph View** button in the page header to access it.

### External Links

Paste any URL to automatically create an external link.

---

## Search and Commands

Easily find content and execute actions within Outliner.

- **Search:** Use the "Search pages" input field at the top of the screen to quickly search across the whole project. Recent searches are remembered for quick access.
- **Search and Replace:** Click the **Search** button in the page header to open the Search and Replace panel. This allows rewriting item text. Page titles stay untouched unless you tick "Include page titles".
- **Command Palette:** The inline command palette opens when you type `/` inside an item. Available options include inserting a Database or an Alias.
- **Breadcrumbs:** Breadcrumbs at the top of each page let you jump back to the project or home.

---

## Selection and Clipboard

Efficiently select and copy multiple items or text ranges.

### Selecting Text

- `Shift + Arrow keys`: Select character by character or line by line. Selections can span multiple items.
- `Ctrl + L`: Select the entire line under the cursor.
- `Shift + Alt + Right`: Expand the selection to the end of the line.
- `Shift + Alt + Left`: Shrink the selection.

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

---

## Attachments

You can easily add attachments to your items.

### Uploading Attachments

You can upload attachments by dragging and dropping an image or file directly onto the editor. You can also click the **Add Image** button in the document toolbar.

---

## Advanced Features

Outliner includes advanced capabilities like aliases and schedule rules.

- **Aliases:** An item can mirror another item and stay in sync with the original.
- **Schedule Rules:** Pages can be scheduled to be published at a later time. Tables can run SQL on a recurrence to append data automatically (e.g., daily or weekly tasks).
- **History / Diff:** Track changes and view differences over time using the **History / Diff** button in the document toolbar.
- **Comments and Votes:** Discuss and vote on items, with live seeded threads and votes.
- **Publishing and Sharing:** Read-only sharing (tokens), scheduled publishing, and snapshots (snapshot diff viewer).
- **Collaboration:** Real-time editing with other users. While others type, you can see their cursors and selections.

---

## Database Tables

Create database tables to manage structured data within your project. You can start with a blank table or use presets like Tasks or Habits.

### Creating a Database Table

Click the **Add Database** button in the top navigation bar.

A new database block will be inserted at the bottom of the current page. Within this block, you can:

- **New Table:** enter a table name, select a preset (e.g., Table, Tasks, or Habits), and click **Create**. The SQL name used in queries is generated automatically and displayed below the input fields.
- **Use an existing table:** switch to the **Existing Table** tab, select a table from the list, and click **Select**.

Additionally, you can view and manage your existing databases by clicking the **Databases** button in the top navigation bar, which opens the databases sidebar.

### Managing Data

Once the table is created, you will see a grid view where you can add, edit, or delete records.

- You can toggle between different views of the table using the buttons at the top:
  - **Grid:** The default view for adding and editing data rows.
  - **Chart:** A visual representation of your data.
  - **Schema:** Allows you to define and edit the SQL schema for your table.
  - **UI:** An editor to customize how columns are displayed (e.g., as text, checkboxes, dates, or select dropdowns).
  - **Schedule:** Create and manage recurring schedule rules (e.g., adding tasks daily or weekly) for the table.
- The table toolbar also provides **Undo** and **Redo** buttons for convenience; these seamlessly integrate with the project's single global history.

### Collaboration

Databases are stored the same way as other outliner data, so data changes and schema updates sync live to everyone in the project.

---

## Calendars

A calendar is a query plus a role assignment over its result columns — which column is the title, the start, the all-day flag, the duration, and which columns are grouping axes. It has no data of its own.

- **Query and Roles:** Candidates for roles are the columns the query actually returns. Changing the query never discards an existing role assignment for a column that is temporarily missing.
- **Writeability:** A query must SELECT both `source_kind` and `source_id` for its rows to be writable; otherwise the calendar is read-only.
- **Views:** Switch between Day, Multi-day, Week, Month, and Gantt views. Gantt view shows one row per entry, nested by the outline's own hierarchy. A parent with dated children shows a rolled-up bar spanning from their earliest start to latest end instead of its own dates; dragging it shifts the whole subtree as one undo entry. A parent's own due date (if any) renders as a marker alongside its rolled-up bar. Axis granularity (day/week/month/quarter) is a view setting.
- **Drag and Drop:** Drag an entry to reschedule it, drag its bottom edge to resize its duration, or move it with the arrow keys. While a drag or resize is in flight, a chip near the pointer shows exactly where the entry will land, formatted in the calendar's own timezone.
- **Swimlanes:** Grouping by "tags" splits the week/day view into swimlanes, one per tag, and colour-codes entries in month view. Drag an entry onto another lane to replace its tag, or hold `Ctrl` (`Cmd` on macOS) while dropping to add the lane's tag instead.
- **Safe Operations:** "New entry" always asks which page to create it under, and deleting an entry always prompts between removing it and just clearing its date.

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
| Undo                    | `Ctrl + Z`                       | `Cmd + Z`                      |
| Redo                    | `Ctrl + Shift + Z` or `Ctrl + Y` | `Cmd + Shift + Z` or `Cmd + Y` |
| Move item up            | `Alt + ↑`                        | `Option + ↑`                   |
| Move item down          | `Alt + ↓`                        | `Option + ↓`                   |
| Open context menu       | `Shift + F10` or `Menu`          | `Shift + F10` or `Menu`        |
