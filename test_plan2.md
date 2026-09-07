Let's find the missing/discrepant information in `docs/user-manual/index.md` & `docs/ja/user-manual/index.md`:

Looking closely at `docs/user-manual/index.md`:

```markdown
### Sidebar Navigation

Click the sidebar toggle button (hamburger menu) in the top-left corner to access the main sidebar navigation. Sections in the sidebar can be expanded or collapsed by clicking their headers. The sidebar provides quick access to:

- **Projects:** Switch between your projects or go home.
- **Pages:** Browse all pages in the current project. You can also quickly create a new page by clicking the **Add new page** button in the section header.
- **Tables:** View and manage database tables.
- **Object Manager:** Manage Grids, Tables, and Schedules centrally.
- **Scheduled SQL:** Manage automated, recurring queries. Schedules belong to the project, not to a table. You can quickly create a new schedule rule by clicking the **Add new scheduled SQL** button in the section header.
- **Settings:** Access project configurations.
- **Docs:** Quick link to the documentation.
- **GitHub:** Quick link to the source code.
```

Wait, in the output:
```
Tables
Sales
...
Object Manager
Manage Grids, Tables, Schedules
Scheduled SQL
...
```

Ah! Look at `Object Manager`. It is a link with text `Manage Grids, Tables, Schedules`!
The docs say:
`- **Object Manager:** Manage Grids, Tables, and Schedules centrally.`
Wait, that is a description, right?
`Object Manager` is actually an independent link under `Tables`, not its own section? Let's check `Tables`. Yes, it's just a link `Object Manager` (with description `Manage Grids, Tables, Schedules` below it).

Is there any missing section?
What about the Login?
`The login status indicator located in the top right corner of the top toolbar shows your current login state. For guest users or when accessing a public space, it will display "Not signed in".`
This is completely true. The topbar is in `header`, which is exactly a top toolbar, and on the right side we have `Databases`, and `Not signed in`.

Let's check `Tables, Grids and Schedules are separate`:
```
- **Schedule** (`/schedules/<project>`, one rule at `/schedules/<project>/<rule>`)
```
Wait, the path for Schedules is `/-/schedules`!
Let's look at `test_sidebar_click_object_manager_6.mjs`: I navigated to `/-/schedules` and it said "Schedules belong to this project." When I navigated to `/schedules`, it said `⚠️ Page not found`.
In `docs/user-manual/index.md`:
`- **Schedule** (`/schedules/<project>`, one rule at `/schedules/<project>/<rule>`) belongs to the project.`
This is a discrepancy! It should be `/-/schedules`. Wait, let me check `test_sidebar_click_object_manager_6.mjs`.

Also, for `/tables/<project>/<table>` and `/grids/<project>/<grid>`. Are they `/-/tables/<project>/<table>`? Let's test that!
