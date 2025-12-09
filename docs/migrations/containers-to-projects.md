# Migration Guide: Containers to Projects

This guide outlines the migration from the old `/containers` URL scheme to the new `/projects` scheme.

## URL Migration

The URL structure for accessing projects has changed.

-   **Old URL:** `https://your-app.com/containers/<container-id>`
-   **New URL:** `https://your-app.com/projects/<project-id>`

The `container-id` and `project-id` are the same.

## Breaking Changes

-   All bookmarks and links using the `/containers` URL are now broken.
-   The API endpoints related to containers have been renamed to reflect the "project" terminology.
-   The data model has been updated to use "project" instead of "container".

## Migration Steps for Developers

1.  **Update Application Code:**
    -   Search your codebase for all instances of `/containers` and replace them with `/projects`.
    -   Update any client-side routing to use the new URL scheme.

2.  **Update API Calls:**
    -   Review your code for any direct API calls to container-related endpoints and update them to the new project-related endpoints.

3.  **Database Migration:**
    -   If you have any references to container IDs or URLs stored in your database, you will need to run a migration script to update them to the new project-based terminology and URLs.

4.  **Inform Users:**
    -   Notify your users of the URL change and advise them to update their bookmarks.
