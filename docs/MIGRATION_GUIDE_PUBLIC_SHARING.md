# Migration Guide: Public/Private Sharing Feature

## Version: 2.0.0 (Breaking Change)

This document outlines the breaking changes introduced in version 2.0.0 with the public/private sharing feature.

## Breaking Changes

### 1. Firestore Schema Updates

The `projects` collection now includes new fields:

#### New Fields Added:

- `isPublic` (boolean): Indicates whether the project is publicly accessible
- `publicAccessToken` (string): Secure token for accessing public projects (32 characters)

#### Example Document Structure:

```json
{
  "containerId": "project123",
  "title": "My Project",
  "ownerId": "user456",
  "isPublic": true,
  "publicAccessToken": "aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV",
  "permissions": [...],
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

### 2. Firebase Security Rules Changes

The Firestore security rules have been updated to allow anonymous read access to public projects.

**What Changed:**

- Public projects can now be read by unauthenticated users
- Write access still requires authentication and proper permissions
- Anonymous users can only read, not modify projects

**Migration Steps:**

```javascript
// Before (v1.x):
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{containerId} {
      allow read, write: if request.auth != null;
    }
  }
}

// After (v2.0+):
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{containerId} {
      allow read: if resource.data.isPublic == true || (request.auth != null);
      allow write: if request.auth != null && [...]; // Owner/editor checks
    }
  }
}
```

### 3. Public URL Format

Public projects are now accessible via URL with a token parameter:

**Format:** `/projects/{projectId}?token={publicAccessToken}`

**Example:**

```
https://outliner.example.com/projects/MyProject?token=aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV
```

### 4. Anonymous Access Mode

Anonymous users accessing public projects will:

- See a "表示のみ" (View Only) badge
- Have read-only access to content
- See a message about logging in to edit
- NOT see edit controls or modification options

## New Features

### 1. Public/Private Toggle

Users can now toggle project visibility:

- **Public**: Anyone with the link can view (read-only)
- **Private**: Only authenticated users with permission can access

### 2. Secure Public Access Tokens

- Cryptographically secure 32-character tokens
- Tokens are generated when making a project public
- Tokens are invalidated when making a project private
- New token generated each time public status is toggled

### 3. Firebase Functions Endpoints

New API endpoints added:

#### `togglePublic`

**Method:** POST
**Endpoint:** `/api/togglePublic`
**Body:**

```json
{
    "idToken": "firebase_auth_token",
    "containerId": "project_id",
    "isPublic": true
}
```

**Response:**

```json
{
    "success": true,
    "isPublic": true,
    "publicAccessToken": "generated_token"
}
```

#### `getProjectPublicStatus`

**Method:** GET
**Endpoint:** `/api/getProjectPublicStatus?idToken=...&containerId=...`
**Response:**

```json
{
    "isPublic": true,
    "publicAccessToken": "token_if_owner" // Only for owners
}
```

## Migration Path for Existing Applications

### For Client Applications

1. **Update Firestore Security Rules:**
   - Deploy the new `firestore.rules` file
   - Test that existing private projects remain secure
   - Verify public project access works as expected

2. **Update Project Metadata Handling:**
   - The new `isPublic` and `publicAccessToken` fields are optional
   - Existing projects will have these fields as `undefined`
   - Code should handle missing fields gracefully

3. **Update Firebase Functions:**
   - Deploy new `togglePublic` and `getProjectPublicStatus` functions
   - Existing projects without the new fields will function normally

### For Existing Projects

**No Action Required:**

- Existing projects will default to `isPublic: false`
- Existing projects will not have a `publicAccessToken` field
- All existing functionality continues to work

**Optional:**

- Project owners can optionally make their projects public
- Existing projects can be migrated to public at the owner's discretion

## API Changes

### New Client-Side Functions (TypeScript)

```typescript
// Toggle project public status
async function togglePublic(
    containerId: string,
    isPublic: boolean,
): Promise<{ success: boolean; publicAccessToken?: string; }>;

// Get project public status
async function getProjectPublicStatus(
    containerId: string,
): Promise<{ isPublic: boolean; publicAccessToken?: string; } | null>;

// Generate public URL
function generatePublicUrl(containerId: string): string;
```

### New metaDoc Functions

```typescript
// Check if container is public
function isContainerPublic(containerId: string): boolean;

// Get public access token
function getPublicAccessToken(containerId: string): string | undefined;

// Toggle public access (local only)
function togglePublicAccess(containerId: string, isPublic: boolean): string | undefined;

// Verify public access token
function verifyPublicAccessToken(containerId: string, token: string): boolean;
```

## Testing

### E2E Tests Added

- `client/e2e/prj-public-sharing-FTR-1a2b3c4d.spec.ts`
- `client/e2e/prj-anonymous-access-FTR-5e6f7g8h.spec.ts`

These test files contain test scenarios for:

- Toggling public/private status
- Generating and using public access tokens
- Anonymous access to public projects
- Read-only mode enforcement
- Security of public URLs

### Running Tests

```bash
# Client tests
cd client
npm run test:e2e -- prj-public-sharing-FTR-1a2b3c4d.spec.ts
npm run test:e2e -- prj-anonymous-access-FTR-5e6f7g8h.spec.ts
```

## Compatibility

### Backward Compatibility

- ✅ All existing functionality preserved
- ✅ Existing projects continue to work without changes
- ✅ Existing authentication flows unchanged
- ✅ Existing API endpoints remain functional

### Browser Compatibility

- Uses `crypto.getRandomValues()` for token generation
- Requires modern browsers with Web Crypto API support
- Fallback handling may be needed for older browsers

## Security Considerations

### Token Security

- 32-character alphanumeric tokens
- Cryptographically secure random generation
- No tokens stored in client-side code permanently
- Tokens are validated server-side via Firebase Security Rules

### Access Control

- Anonymous users get read-only access to public projects
- Write operations still require authentication
- Project owners control visibility
- Public access can be disabled at any time

### Data Protection

- No sensitive data should be stored in public projects
- Anonymous users cannot access private projects
- All access is logged via Firebase

## Rollback Plan

If issues arise, the changes can be rolled back:

1. **Revert Firestore Rules:** Deploy previous `firestore.rules`
2. **Remove Firebase Functions:** Unpublish `togglePublic` and `getProjectPublicStatus`
3. **Update Client Code:** Remove public sharing UI and logic
4. **Data Cleanup:** Existing `isPublic` and `publicAccessToken` fields will be ignored

## Support

For questions or issues:

1. Check this migration guide
2. Review the breaking changes section
3. Test in a development environment first
4. Contact support with specific error messages or behaviors

---

**Last Updated:** December 6, 2025
**Version:** 2.0.0
