# API Documentation: Project Management

This document outlines the API endpoints for managing projects.

## Project Schema

Project objects will be updated to include the following fields:

- `isPublic` (boolean): Indicates if the project is publicly accessible.
- `permissions` (object): Stores user roles and access rights.

## Endpoints

### 1. Rename a Project

- **Endpoint:** `PUT /api/projects/{projectId}/rename`
- **Description:** Renames a project.
- **Permissions:** Project Owner
- **Request Body:**
  ```json
  {
      "newName": "New Project Title"
  }
  ```
- **Response:**
  - `200 OK`: If the rename is successful.
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user does not have permission to rename the project.

### 2. Update Permissions

- **Endpoint:** `POST /api/projects/{projectId}/permissions`
- **Description:** Updates the permissions for a user.
- **Permissions:** Project Owner
- **Request Body:**
  ```json
  {
      "email": "user@example.com",
      "role": "Editor"
  }
  ```
- **Response:**
  - `200 OK`: If the permissions are updated.
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user does not have permission to update permissions.

### 3. Share a Project Publicly

- **Endpoint:** `POST /api/projects/{projectId}/share`
- **Description:** Enables or disables public sharing for a project.
- **Permissions:** Project Owner
- **Request Body:**
  ```json
  {
      "isPublic": true,
      "password": "optional-password"
  }
  ```
- **Response:**
  - `200 OK`: If the sharing settings are updated.
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user does not have permission to share the project.

### 4. Delete a Project

- **Endpoint:** `DELETE /api/projects/{projectId}`
- **Description:** Deletes a project.
- **Permissions:** Project Owner
- **Response:**
  - `204 No Content`: If the project is deleted successfully.
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user does not have permission to delete the project.

### 5. Restore a Project

- **Endpoint:** `POST /api/projects/{projectId}/restore`
- **Description:** Restores a deleted project.
- **Permissions:** Project Owner
- **Response:**
  - `200 OK`: If the project is restored.
  - `401 Unauthorized`: If the user is not authenticated.
  - `403 Forbidden`: If the user does not have permission to restore the project.
