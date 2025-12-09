# Migration Guide: Containers to Projects

This guide documents the migration from the old `/containers` URL structure to the new `/projects` structure.

## Breaking Changes

- The base URL for all container-related resources has changed from `/containers` to `/projects`.
- The term "container" has been replaced with "project" throughout the application.
- The data schema for projects has been updated to include new fields for project management features.

## Migration Steps for Developers

1. **Update API calls:**
   - All API calls that previously used the `/containers` endpoint should be updated to use the `/projects` endpoint.
   - For example, a call to `/api/containers/:containerId` should be changed to `/api/projects/:projectId`.

2. **Update frontend routes:**
   - All frontend routes that used the `/containers` path should be updated to use the `/projects` path.
   - For example, a route to `/containers/:containerId` should be changed to `/projects/:projectId`.

3. **Update data models:**
   - Update your data models to reflect the new project schema, which includes the `isPublic` and `permissions` fields.

4. **Review user-facing text:**
   - Search your codebase for any instances of the word "container" and replace them with "project" where appropriate.
