# Migration Guide: v1.x to v2.0.0

## Breaking Changes Overview

Version 2.0.0 introduces a comprehensive **Access Control and Permission Management** system that fundamentally changes how project access is controlled. This is a **breaking change** that affects the database schema, Firebase Security Rules, and API endpoints.

## What's New

### 1. Three-Tier Permission System

- **Owner**: Full control (delete, manage permissions, settings)
- **Editor**: Can edit content but cannot delete or manage permissions
- **Viewer**: Read-only access

### 2. Database Schema Changes

The `projects` collection now includes new fields:

- `ownerId: string` - ID of the project owner
- `permissions: ProjectPermission[]` - Array of permission objects

Each permission object contains:

```typescript
{
    userId: string;
    role: "owner" | "editor" | "viewer";
    grantedAt: number;
    grantedBy: string;
}
```

### 3. Firebase Security Rules Updated

The `firestore.rules` file has been updated to enforce permission-based access control:

- Projects can only be read by users with at least "viewer" role
- Projects can only be updated by users with at least "editor" role
- Projects can only be deleted by users with "owner" role
- Permission management is restricted to owners

### 4. Backend API Changes

Firebase Functions now enforce permissions:

- `saveContainer`: Creates project with owner permission on first access
- `deleteContainer`: Requires owner role
- New endpoints for permission management (to be implemented separately)

## Migration Instructions

### For Existing Users

#### Automatic Migration

The system is designed to automatically migrate existing projects:

1. **First User Access**: When a user accesses a project for the first time after the upgrade:
   - If the project has no permissions array, the system will grant the accessing user **owner** permissions
   - The `ownerId` field is automatically set to the first user's ID
   - This ensures backward compatibility for existing projects

2. **No Action Required**: Existing projects will continue to work without any manual intervention

#### Manual Verification (Optional)

To verify your projects have been migrated:

1. Check the Firestore console
2. Navigate to the `projects` collection
3. Verify that projects have:
   - An `ownerId` field
   - A `permissions` array with at least one entry (the owner)

### For Developers

#### Code Changes Required

If you have custom code that interacts with projects, you may need to update it:

1. **Fetching Projects**
   ```typescript
   // OLD (still works for backward compatibility)
   const projects = await getProjects();

   // NEW (recommended)
   const projects = await getAccessibleProjects(userId);
   ```

2. **Permission Checks**
   ```typescript
   // Import the permission service
   import { canDelete, canEdit, canManagePermissions } from "./services/permissionService";

   // Check permissions
   const permissions = project.permissions || [];
   const canUserEdit = canEdit(permissions, userId);
   const canUserDelete = canDelete(permissions, userId);
   const canManage = canManagePermissions(permissions, userId);
   ```

3. **UI Integration**
   ```svelte
   <!-- Add the ProjectPermissions component to your settings page -->
   <script>
   import ProjectPermissions from "./lib/components/ProjectPermissions.svelte";
   </script>

   <ProjectPermissions
       containerId={projectId}
       permissions={project.permissions}
       ownerId={project.ownerId}
   />
   ```

#### Firebase Security Rules Deployment

You must update your Firebase Security Rules:

```bash
# Deploy the new rules
firebase deploy --only firestore:rules
```

**⚠️ Important**: After deploying the new rules, test thoroughly to ensure your application's access patterns are still working correctly.

#### Testing

Run the new E2E tests for the permission system:

```bash
cd client
npm run test:e2e -- prj-permissions-owner-95e7c1a6.spec.ts
```

## API Changes

### Endpoints

All existing endpoints continue to work, with additional permission checks:

1. **POST /saveContainer**
   - Now requires user to have at least "viewer" role for existing projects
   - Automatically creates project with "owner" permission for new projects

2. **POST /deleteContainer**
   - Now requires user to have "owner" role
   - Returns 403 Forbidden if user is not the owner

3. **Future Endpoints** (not yet implemented in this version)
   - `POST /addProjectPermission` - Add/Update user permissions (Owner only)
   - `POST /removeProjectPermission` - Remove user permissions (Owner only)
   - `GET /getProjectPermissions` - Get project permissions (Owner/Editor/Viewer)

## Breaking Changes

### 1. Database Schema

- **Field Addition**: `ownerId` and `permissions` fields are now required in the `projects` collection
- **Backward Compatibility**: The system handles missing fields gracefully, but you should migrate existing data

### 2. Security Rules

- **Access Restriction**: Previously, any authenticated user could access any project
- **New Behavior**: Access is now restricted based on permissions
- **Fallback**: For projects without permissions array, access is granted (backward compatibility)

### 3. API Behavior

- **403 Forbidden**: New error code for permission-denied scenarios
- **Automatic Permissions**: New projects automatically grant owner permissions to the creator

## Rollback Plan

If you encounter issues with the migration:

### 1. Revert Security Rules (Temporary)

```bash
# Revert to the old rules (allows all authenticated users)
firebase deploy --only firestore:rules --force
```

### 2. Remove Permission Checks (Temporary)

Edit `functions/index.js` and comment out the permission checking code in:

- `saveContainer` function (lines 323-339)
- `deleteContainer` function (lines 658-673)

### 3. Fresh Migration

After fixing issues:

1. Re-enable the permission checks
2. Deploy the new security rules
3. Test with the E2E tests

## Testing

### Automated Tests

Run the comprehensive test suite:

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (including new permission tests)
npm run test:e2e

# All tests
npm test
```

### Manual Testing Checklist

- [ ] Create a new project and verify the creator becomes owner
- [ ] Add an editor and verify they can edit but not delete
- [ ] Add a viewer and verify they have read-only access
- [ ] Verify owners can manage permissions
- [ ] Verify deleted/expired users are handled correctly
- [ ] Test with existing projects to ensure backward compatibility

## Support

If you encounter issues during migration:

1. Check the test logs: `server/logs/test-svelte-kit.log`
2. Review the E2E test results
3. Consult the [Permission System Documentation](./docs/permission-system.md)
4. Open an issue on GitHub with:
   - Version: v2.0.0
   - Error messages
   - Steps to reproduce
   - Expected vs actual behavior

## Timeline

- **v2.0.0 Release**: Immediate
- **Migration Period**: Automatic, no action required
- **Backward Compatibility**: Maintained indefinitely
- **Deprecation Notice**: None (features are additive)

## Summary

This migration introduces powerful permission management capabilities while maintaining full backward compatibility. Existing users will see no disruption, and the system automatically grants appropriate permissions to ensure continuity of access.
