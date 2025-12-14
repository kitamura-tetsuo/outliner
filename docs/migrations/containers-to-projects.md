# Migration Guide: From Containers to Projects

This guide details the migration from the old `/containers` URL structure to the new `/projects` structure.

## URL Migration

The URL scheme for accessing projects has been updated to provide a more intuitive and RESTful structure.

-   **Old URL Structure:** `/containers/{containerId}`
-   **New URL Structure:** `/projects/{projectId}`

All bookmarks, links, and API calls should be updated to use the new `/projects` endpoint. The underlying `projectId` is the same as the old `containerId`.

## Breaking Changes

-   **API Endpoints:** All API endpoints that previously used `/containers` now use `/projects`. For example, `GET /api/containers/{containerId}` is now `GET /api/projects/{projectId}`.
-   **Frontend Routes:** All frontend routes have been updated from `/containers` to `/projects`.

## Migration Steps for Developers

1.  **Update API Calls:** Search your codebase for all instances of `/api/containers` and replace them with `/api/projects`.
2.  **Update Frontend Links:** Update all internal links and navigation elements in your frontend code to use the `/projects` path.
3.  **Update Documentation:** Ensure any user-facing or internal documentation is updated to reflect the new URL structure.
4.  **Inform Users:** If your application is already in production, inform your users of the URL change and advise them to update their bookmarks. Consider implementing redirects from the old URLs to the new ones to ensure a smooth transition.
