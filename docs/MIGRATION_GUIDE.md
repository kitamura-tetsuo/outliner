# Migration Guide: URL Structure Change from /containers to /projects

## Overview

This document provides instructions for migrating from the legacy `/containers` URL structure to the new `/projects` URL structure in the Outliner application.

**Version**: 1.0.0 (Breaking Change)
**Date**: December 2025

## What Changed

The Outliner application has migrated from `/containers` to `/projects` as the primary URL structure for accessing project-related pages. This change affects all routing and navigation within the application.

### Changes Made

1. **Route Directory Migration**
   - Old: `client/src/routes/containers/`
   - New: `client/src/routes/projects/`

2. **URL Structure Changes**
   - Old: `https://domain.com/containers`
   - New: `https://domain.com/projects`

3. **Updated Internal Links**
   - Home page ("/"): New project creation link now points to `/projects`
   - ContainerSelector component: "新規作成" button now links to `/projects`

## Breaking Changes

### ❌ Removed Features

- All `/containers` routes now return 404 errors
- Old URLs with `/containers` path will no longer work

### ✅ New Features

- All project-related functionality now accessible via `/projects`
- Improved URL consistency aligned with project terminology
- Foundation for future project management features

## Migration Instructions

### For End Users

If you have bookmarks or saved links using the old `/containers` URL structure:

1. **Update Bookmarks**: Replace any bookmarks from `*/containers` to `*/projects`
2. **Update Links**: Any external links pointing to `/containers` must be updated to `/projects`
3. **Update Integrations**: Any services or scripts that reference `/containers` must be updated

**Example Migration**:

```bash
# Old URL
https://example.com/containers

# New URL
https://example.com/projects
```

### For Developers

If you have code that references the old URL structure:

1. **Find and Replace**: Search your codebase for `/containers` and replace with `/projects`
2. **Test Updates**: Update any automated tests that check for `/containers` URLs
3. **Update Documentation**: Any developer documentation should reference `/projects`

**Example Code Update**:

```javascript
// Old code
window.location.href = "/containers";

// New code
window.location.href = "/projects";
```

## Affected Files

The following files were modified during this migration:

### Modified Files

- `client/src/routes/+page.svelte` - Updated new project creation link
- `client/src/components/ContainerSelector.svelte` - Updated "新規作成" button link
- `client/src/routes/containers/+page.svelte` - Moved to `client/src/routes/projects/+page.svelte`
- `ContainerSelector_original.svelte` - Updated reference
- `ContainerSelector_fixed.svelte` - Updated reference

### Version Updates

- `client/package.json` - Version bumped from `0.0.1` to `1.0.0`

## Testing

After migrating, verify the following functionality works correctly:

1. **Project Creation**: Navigate to `/projects` and create a new project
2. **Project Navigation**: Ensure all project pages load correctly
3. **Links and Buttons**: All "新規作成" buttons navigate to `/projects`
4. **Bookmark Updates**: Updated bookmarks work correctly

## Rollback Plan

If you need to rollback to the previous version:

```bash
# Revert the route directory
mv /workspace/client/src/routes/projects /workspace/client/src/routes/containers

# Revert package.json version
sed -i 's/"version": "1.0.0"/"version": "0.0.1"/' /workspace/client/package.json

# Revert link changes in the following files:
# - client/src/routes/+page.svelte (change /projects back to /containers)
# - client/src/components/ContainerSelector.svelte (change /projects back to /containers)
```

## Support

If you encounter issues during migration:

1. Check the [project documentation](../client-features.md) for feature-specific details
2. Review the [CHANGELOG](../CHANGELOG.md) for version 1.0.0
3. Contact the development team for support

## Future Roadmap

This URL structure migration is part of a larger project management enhancement initiative. Future releases will include:

- Project renaming functionality
- Trash/restore capabilities (logical deletion)
- Access control (Owner/Editor/Viewer permissions)
- Public/private sharing mechanisms

These features will build on the new `/projects` URL structure introduced in version 1.0.0.
