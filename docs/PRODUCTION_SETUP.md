# Production Environment Setup Guide

## Required GitHub Secrets

To ensure the application operates correctly in the production environment, you need to configure the following GitHub Secrets.

### Azure Fluid Relay Settings

1. **AZURE_TENANT_ID**
   - Tenant ID for Azure Fluid Relay
   - Example: `your-production-tenant-id`

2. **AZURE_ENDPOINT**
   - Endpoint for Azure Fluid Relay
   - Example: `https://your-production-endpoint.fluidrelay.azure.com`

3. **AZURE_PRIMARY_KEY**
   - Primary key for Azure Fluid Relay
   - Example: `your-production-primary-key`

4. **AZURE_SECONDARY_KEY**
   - Secondary key for Azure Fluid Relay
   - Example: `your-production-secondary-key`

5. **AZURE_ACTIVE_KEY**
   - The key to use ("primary" or "secondary")
   - Usually `primary`

### Firebase Settings

6. **FIREBASE_API_KEY**
   - API Key for the Firebase project

7. **FIREBASE_TOKEN**
   - Token for Firebase CLI deployment

## Current Issues

The following error is occurring in the production environment:

```
[HTTP/1.1 404] /api/fluid-token
[ERROR]: Endpoint not found
```

### Possible Causes

1. **Incorrect Azure Configuration**: Azure settings in GitHub Secrets are incorrect
2. **Key Mismatch**: The key set in Azure Fluid Relay does not match the key in GitHub Secrets
3. **Tenant ID Mismatch**: The Tenant ID for Azure Fluid Relay is incorrect

### Resolution Steps

1. Check Fluid Relay service settings in the Azure Portal
2. Update Azure settings in GitHub Secrets with the correct values
3. Execute deployment to reflect the settings
4. Check Firebase Functions logs to verify if the issue is resolved

### How to Check Logs

You can check Firebase Functions logs with the following command:

```bash
firebase functions:log --project outliner-d57b0
```

Or you can check logs in the "Functions" section of the Firebase Console.

## Troubleshooting

### If 401 Errors Persist

1. Verify that Firebase Authentication is configured correctly
2. Verify that client-side Firebase settings are correct
3. Verify that the ID token is being sent correctly

### If 403 Errors (Invalid token) Persist

1. Verify that the Azure Fluid Relay key matches GitHub Secrets
2. Verify that the Tenant ID is correct
3. Verify that the Azure Fluid Relay service is enabled
