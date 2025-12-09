# API Documentation

This document provides an overview of the API endpoints for this application.

_**Note:** This documentation is a work in progress._

## Project Management

### Endpoints

- **`POST /api/projects`**: Creates a new project.
- **`PUT /api/projects/:projectId`**: Updates a project, including renaming.
- **`DELETE /api/projects/:projectId`**: Deletes a project.
- **`POST /api/projects/:projectId/restore`**: Restores a deleted project.
- **`GET /api/projects/:projectId/permissions`**: Retrieves the permissions for a project.
- **`POST /api/projects/:projectId/permissions`**: Updates the permissions for a project.
- **`POST /api/projects/:projectId/share`**: Enables or disables public sharing for a project.

### Schema Changes

The project schema has been updated to include the following fields:

- `isPublic` (boolean): Indicates whether the project is publicly shared.
- `permissions` (object): An object containing user IDs and their corresponding permission levels.

### Permission Requirements

- All project management endpoints require the user to be authenticated.
- The user must have the appropriate permissions to perform the requested action (e.g., only project owners can delete a project).
