# Production Data Deletion Feature

Feature and scripts to safely delete all data in the production environment.

## ⚠️ Important Warning

**This feature completely deletes all data in the production environment. Deleted data cannot be restored.**

- All Firebase Firestore collections
- All Firebase Auth users
- All Firebase Storage files

Please ensure you create a backup before execution.

## Feature Overview

### 1. Firebase Functions API Endpoint

**Endpoint**: `/api/deleteAllProductionData`

API endpoint to delete production data.

#### Authentication

- **Admin Token**: `ADMIN_DELETE_ALL_DATA_2024`
- **Confirmation Code**: `DELETE_ALL_PRODUCTION_DATA_CONFIRM`

#### Request Example

```bash
curl -X POST https://us-central1-outliner-d57b0.cloudfunctions.net/deleteAllProductionData \
  -H "Content-Type: application/json" \
  -d '{
    "adminToken": "ADMIN_DELETE_ALL_DATA_2024",
    "confirmationCode": "DELETE_ALL_PRODUCTION_DATA_CONFIRM"
  }'
```

#### Response Example

```json
{
    "success": true,
    "message": "Production data deletion completed",
    "results": {
        "firestore": {
            "success": true,
            "error": null,
            "deletedCollections": [
                { "name": "users", "count": 150 },
                { "name": "containers", "count": 300 },
                { "name": "projects", "count": 75 }
            ]
        },
        "auth": {
            "success": true,
            "error": null,
            "deletedUsers": 150
        },
        "storage": {
            "success": true,
            "error": null,
            "deletedFiles": 500
        }
    },
    "timestamp": "2024-08-04T12:00:00.000Z"
}
```

### 2. Management Scripts

#### Unified Management Script (Recommended)

```bash
# Show help
node scripts/production-data-manager.js help

# Check environment
node scripts/production-data-manager.js check

# Backup data
node scripts/production-data-manager.js backup

# Delete data (with confirmation)
node scripts/production-data-manager.js delete --confirm

# Delete data (force execution)
node scripts/production-data-manager.js delete --confirm --force

# Full workflow (Check -> Backup -> Delete)
node scripts/production-data-manager.js full --confirm
```

#### Individual Scripts

```bash
# Check environment
node scripts/check-production-environment.js

# Backup data
node scripts/backup-production-data.js

# Delete data
node scripts/delete-production-data.js --confirm
```

## Safety Features

### 1. Environment Check

- Automatic determination of production environment
- Detection of emulator environment
- Connection check for Firebase Functions/Hosting

### 2. Backup Feature

Backs up the following data before deletion:

- **Firestore**: Documents of all collections
- **Firebase Auth**: All user information
- **Firebase Storage**: File list (metadata)

Backups are saved in `backups/production-backup-{timestamp}/`.

### 3. Confirmation Feature

- Authentication with Admin Token
- Double confirmation with Confirmation Code
- Executable only in production environment
- Interactive confirmation prompts

## Usage Instructions

### Recommended Procedure (Using Unified Script)

1. **Check Environment**
   ```bash
   node scripts/production-data-manager.js check
   ```

2. **Create Backup**
   ```bash
   node scripts/production-data-manager.js backup
   ```

3. **Delete Data**
   ```bash
   node scripts/production-data-manager.js delete --confirm
   ```

### One-Step Execution

```bash
# Execute all steps at once (Check -> Backup -> Delete)
node scripts/production-data-manager.js full --confirm
```

## Error Handling

### Common Errors

1. **401 Unauthorized**
   - Incorrect Admin Token
   - Solution: Use the correct token

2. **400 Invalid confirmation code**
   - Incorrect Confirmation Code
   - Solution: Use the correct confirmation code

3. **400 This endpoint only works in production environment**
   - Attempting to run in a test environment
   - Solution: Run in the production environment

### Checking Logs

Check Firebase Functions logs:

```bash
firebase functions:log --project outliner-d57b0
```

## Testing

Verification in test environment:

```bash
cd scripts
npm test -- tests/production-data-deletion.spec.js tests/environment-check.spec.js
```

## Security Considerations

1. **Auth Token**: Treat the Admin Token as confidential information
2. **Access Control**: Executable only in production environment
3. **Logging**: All operations are logged
4. **Backup**: Always create a backup before deletion

## Recovery Procedure

If data is accidentally deleted:

1. **Restore from Backup**
   - Check the latest backup in the `backups/` directory
   - Manually restore data from the Firebase Console

2. **Rebuild Firebase Project**
   - Create a new Firebase project if necessary
   - Restore data using the backup data

## Related Files

- `functions/index.js` - API endpoint implementation
- `scripts/production-data-manager.js` - Unified management script
- `scripts/delete-production-data.js` - Data deletion script
- `scripts/backup-production-data.js` - Backup script
- `scripts/check-production-environment.js` - Environment check script
- `scripts/tests/` - Test files

## Notes

- Use this feature only in emergencies or when terminating the project
- Deleted data cannot be restored
- Ensure you have approval from relevant parties before execution
- Do not forget to create a backup
