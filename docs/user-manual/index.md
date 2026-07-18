# Outliner User Manual

Welcome to the Outliner user manual. This guide provides human-readable instructions on how to use Outliner, from basic navigation to advanced features.

## Table of Contents

1. [Basic Operations](#basic-operations)
2. [Text Editing and Formatting](#text-editing-and-formatting)
3. [Item Manipulation](#item-manipulation)
4. [Links](#links)
5. [Search and Commands](#search-and-commands)
6. [Selection and Copy & Paste](#selection-and-copy--paste)
7. [Attachments](#attachments)
8. [Advanced Features](#advanced-features)
9. [Database](#database)
10. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Basic Operations

An overview of the basic interface and navigation.

### Switching to Edit Mode

Click on any text to place your cursor there and enter edit mode.

### Moving Between Items

Use the keyboard arrow keys (`↑`, `↓`, `←`, `→`) to freely move your cursor.

- Move to the beginning of the line: `Home`
- Move to the end of the line: `End`

---

## Text Editing and Formatting

Outliner uses Scrapbox-style syntax for text formatting options.

### Applying Formatting

- Bold: Wrap text in double brackets `[[bold]]`
- Italic: Wrap text in a slash bracket `[/italic]`
- Strikethrough: Wrap text in a dash bracket `[-strikethrough]`
- Code: Wrap inline code in backticks \`code\`
- URLs: Typed URLs automatically become clickable links
- Formats can be combined, like bold with italic inside.

---

## Item Manipulation

Powerful item manipulation features expected in an outliner.

### Adding New Items

Press `Enter` to insert a new item below the current one.

### Indenting Items

- Decrease indent: `Tab` at the beginning of a line
- Increase indent: `Shift + Tab` at the beginning of a line

### Moving Items

Easily reorder items using drag and drop.

---

## Links

Create links to other pages within Outliner or external websites.

### Internal Links

Type `[` once, then enter a page name to create a link to another page (e.g., `[page name]`).

- Links to pages that do not exist yet look different, and the page is only created once you edit it.
- You can also link to a page in another project with `[project/page]` syntax.
- **Backlinks:** Pages that link to the current page are listed in the backlink panel at the bottom.
- **Graph view:** The graph view visualizes how the pages of a project are connected.

### External Links

Paste any URL to automatically create an external link.

---

## Search and Commands

Easily find content and execute actions within Outliner.

- **Search:** Use the Search button at the top of a page to search across the whole project. Recent searches are remembered for quick access.
- **Command Palette:** The inline command palette opens when you type `/` inside an item.
- **Breadcrumbs:** Breadcrumbs at the top of each page let you jump back to the project or home.

---

## Selection and Copy & Paste

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

---

## Attachments

You can easily add attachments to your items.

### Uploading Attachments

You can upload attachments by dragging and dropping an image or file directly onto the editor.

---

## Advanced Features

Outliner includes advanced capabilities like aliases and scheduling.

- **Aliases:** An item can mirror another item and stay in sync with the original.
- **Schedule:** The Schedule view shows date-tagged items as a timeline.

---

## Database

Create database tables to manage structured data within your project. You can start with a blank table or use presets like Tasks or Habits.

### Creating a Database Table

Click the **Add Database** button in the top left toolbar.

- A new database block will be inserted at the bottom of the current page.
- To create a new table, enter a table name, select a preset (e.g., Blank Table, Tasks, or Habits), and click **Create**.
- To use an existing table, switch to the **Existing Table** tab, select a table from the list, and click **Select**.
- You can access your existing databases under the **Tables** section in the left sidebar, or view and manage them by clicking the **Databases** button in the top right toolbar, which opens the databases sidebar.

### Managing Data

Once the table is created, you will see a grid view where you can add, edit, or delete records.

- You can toggle between different views of the table using the buttons at the top:
  - **Grid:** The default view for adding and editing data rows.
  - **Chart:** A visual representation of your data.
  - **Schema:** Allows you to define and edit the SQL schema for your table.
  - **UI:** An editor to customize how columns are displayed (e.g., as text, checkboxes, dates, or select dropdowns).
- The table toolbar also provides **Undo** and **Redo** buttons specific to the table's data.

### Collaboration

Databases are stored the same way as other outliner data, so data changes and schema updates sync live to everyone in the project.

---

## Keyboard Shortcuts

| Action                  | Windows/Linux         | Mac                      |
| ----------------------- | --------------------- | ------------------------ |
| Add new item            | `Enter`               | `Enter`                  |
| Select entire line      | `Ctrl + L`            | `Cmd + L`                |
| Select to start of line | `Shift + Home`        | `Shift + Home`           |
| Select to end of line   | `Shift + End`         | `Shift + End`            |
| Box selection (Mouse)   | `Alt + Shift + Drag`  | `Option + Shift + Drag`  |
| Box selection (Key)     | `Alt + Shift + Arrow` | `Option + Shift + Arrow` |
| Expand selection        | `Shift + Alt + Right` | `Shift + Option + Right` |
| Shrink selection        | `Shift + Alt + Left`  | `Shift + Option + Left`  |
