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
11. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Basic Operations

An overview of the basic interface and navigation.

### Creating a Page

You can create a new page from the project home page. Simply enter a title in the "New page name" input field and click the **Create** button.

### Switching to Edit Mode

Click on any text to place your cursor there and enter edit mode.

### Moving Between Items

Use the keyboard arrow keys (`↑`, `↓`, `←`, `→`) to freely move your cursor.

- Move to the beginning of the line: `Home`
- Move to the end of the line: `End`

### Sidebar Navigation

Click the hamburger menu in the top-left corner to access the main sidebar navigation. The sidebar provides quick access to:

- **Projects:** Switch between your projects or go home.
- **Pages:** Browse all pages in the current project.
- **Tables:** View and manage database tables.
- **Scheduled SQL:** Manage automated, recurring queries.
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

Easily reorder items using drag and drop.

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
- You can also link to a page in another project with `[project/page]` syntax.
- **Backlinks:** Pages that link to the current page are listed in the backlink panel at the bottom.
- **Graph view:** The graph view visualizes how the pages of a project are connected. Click the **Graph View** button in the page header to access it.

### External Links

Paste any URL to automatically create an external link.

---

## Search and Commands

Easily find content and execute actions within Outliner.

- **Search:** Use the Search pages input field in the top navigation bar or the **Search** button in the page header to search across the whole project. Recent searches are remembered for quick access.
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

Outliner includes advanced capabilities like aliases and scheduling.

- **Aliases:** An item can mirror another item and stay in sync with the original.
- **Schedule:** The Schedule view shows date-tagged items as a timeline.
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

- **New Table:** enter a table name, select a preset (e.g., Table, Tasks, or Habits), and click **Create**.
- **Use an existing table:** switch to the **Existing Table** tab, select a table from the list, and click **Select**.

Additionally, you can view and manage your existing databases by clicking the **Databases** button in the top navigation bar, which opens the databases sidebar.

### Managing Data

Once the table is created, you will see a grid view where you can add, edit, or delete records.

- You can toggle between different views of the table using the buttons at the top:
  - **Grid:** The default view for adding and editing data rows.
  - **Chart:** A visual representation of your data.
  - **Schema:** Allows you to define and edit the SQL schema for your table.
  - **UI:** An editor to customize how columns are displayed (e.g., as text, checkboxes, dates, or select dropdowns).
  - **Schedule:** A calendar-like view for date-tagged data.
- The table toolbar also provides **Undo** and **Redo** buttons specific to the table's data.

### Collaboration

Databases are stored the same way as other outliner data, so data changes and schema updates sync live to everyone in the project.

---

## Keyboard Shortcuts

You can also access a complete list of shortcuts by clicking the **Keyboard & accessibility help** link in the document toolbar.

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
