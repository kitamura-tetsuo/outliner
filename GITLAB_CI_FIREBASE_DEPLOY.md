# Firebase Deployment Settings with GitLab CI

This document describes how to automate deployment to Firebase Hosting + Functions using GitLab CI.

## Prerequisites

1. GitLab repository is configured
2. Firebase project is created
3. Firebase CLI is installed locally

## Configuration Steps

### 1. Get Firebase CLI Token

Run the following command to get the Firebase CLI token:

```bash
firebase login:ci
```

This command opens a browser and asks for authentication with your Google account. Upon successful authentication, the token will be displayed.

### 2. Configure GitLab CI Environment Variables

Set the following environment variables in your GitLab project under "Settings" -> "CI/CD" -> "Variables":

#### Azure Fluid Relay Related Variables

- `AZURE_TENANT_ID`: Azure Fluid Relay Tenant ID
- `AZURE_FLUID_RELAY_ENDPOINT`: Azure Fluid Relay Endpoint URL
- `AZURE_PRIMARY_KEY`: Azure Fluid Relay Primary Key
- `AZURE_SECONDARY_KEY`: Azure Fluid Relay Secondary Key (Optional)
- `AZURE_ACTIVE_KEY`: Key to use ("primary" or "secondary")

#### Firebase Related Variables

- `FIREBASE_TOKEN`: Firebase CLI Token
- `FIREBASE_API_KEY`: Firebase Project Web API Key
- `FIREBASE_AUTH_DOMAIN`: Firebase Auth Domain (e.g. `your-project.firebaseapp.com`)
- `FIREBASE_PROJECT_ID`: Firebase Project ID
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage Bucket (e.g. `your-project.appspot.com`)
- `FIREBASE_MESSAGING_SENDER_ID`: Firebase Messaging Sender ID
- `FIREBASE_APP_ID`: Firebase App ID
- `FIREBASE_MEASUREMENT_ID`: Firebase Analytics Measurement ID (e.g. `G-XXXXXXXXXX`)

It is recommended to check "Protected" and "Masked" for all these variables to secure them. Especially `FIREBASE_TOKEN` and `AZURE_PRIMARY_KEY` are sensitive information, so be sure to mask them.

### 3. Configure .gitlab-ci.yml

Add the following deployment stage to your `.gitlab-ci.yml` file:

```yaml
deploy-to-firebase:
    stage: deploy
    image: node:22-slim
    dependencies:
        - e2e-tests # Run deployment only if test job succeeds
    variables:
        FIREBASE_TOKEN: ${FIREBASE_TOKEN}
        AZURE_TENANT_ID: ${AZURE_TENANT_ID}
        AZURE_FLUID_RELAY_ENDPOINT: ${AZURE_FLUID_RELAY_ENDPOINT}
        AZURE_PRIMARY_KEY: ${AZURE_PRIMARY_KEY}
        AZURE_SECONDARY_KEY: ${AZURE_SECONDARY_KEY}
        AZURE_ACTIVE_KEY: ${AZURE_ACTIVE_KEY}
    before_script:
        - "apt-get update && apt-get install -y curl"
        - "npm install -g firebase-tools"
        - 'echo "CI_PROJECT_DIR: ${CI_PROJECT_DIR}"'
        - "mkdir -p ${CI_PROJECT_DIR}/logs/"
    script:
        # Build client
        - "cd ${CI_PROJECT_DIR}/client"
        - "npm ci"
        - 'echo "Creating client .env file..."'
        - |
              cat > .env << EOF
              # Azure Fluid Relay Settings
              VITE_AZURE_TENANT_ID=${AZURE_TENANT_ID}
              VITE_AZURE_FLUID_RELAY_ENDPOINT=${AZURE_FLUID_RELAY_ENDPOINT}
              VITE_USE_FIREBASE_AUTH=true
              VITE_USE_API_AUTH=true

              # Connection Service Selection
              VITE_USE_TINYLICIOUS=false
              VITE_FORCE_AZURE=true

              # API Settings - Firebase Functions Endpoint
              VITE_API_BASE_URL=https://outliner-d57b0.web.app
              VITE_API_SERVER_URL=https://outliner-d57b0.web.app

              # Fluid Framework Telemetry Settings
              VITE_DISABLE_FLUID_TELEMETRY=true

              # Firebase Settings
              VITE_FIREBASE_API_KEY=${FIREBASE_API_KEY}
              VITE_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}
              VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
              VITE_FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}
              VITE_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}
              VITE_FIREBASE_APP_ID=${FIREBASE_APP_ID}
              VITE_FIREBASE_MEASUREMENT_ID=${FIREBASE_MEASUREMENT_ID}
              EOF
        - "npm run build"

        # Build Firebase Functions
        - "cd ${CI_PROJECT_DIR}/functions"
        - "npm ci"

        # Create Firebase Functions environment variable file
        - "cd ${CI_PROJECT_DIR}"
        - 'echo "Creating Firebase Functions .env file..."'
        - |
              cat > functions/.env << EOF
              # Azure Fluid Relay Settings
              AZURE_TENANT_ID=${AZURE_TENANT_ID}
              AZURE_FLUID_RELAY_ENDPOINT=${AZURE_FLUID_RELAY_ENDPOINT}
              AZURE_PRIMARY_KEY=${AZURE_PRIMARY_KEY}
              AZURE_SECONDARY_KEY=${AZURE_SECONDARY_KEY}
              AZURE_ACTIVE_KEY=${AZURE_ACTIVE_KEY}

              # Production Environment Settings
              NODE_ENV=production
              EOF

        # Deploy to Firebase
        - 'firebase deploy --token "${FIREBASE_TOKEN}" --non-interactive'
    only:
        - main # Run deployment only when pushed to main branch
```

### 4. Verify Build Settings

Ensure that the hosting section in `firebase.json` matches the build output destination in `client/svelte.config.js`:

- In `firebase.json` hosting section, `"public": "build"` should be set.
- In `client/svelte.config.js` adapter section, `pages: '../build', assets: '../build'` should be set.

### 5. Test Deployment

Once configured, push to the main branch and verify that the deployment runs successfully. You can check the deployment progress in the GitLab CI pipeline logs.

## Troubleshooting

### If Deployment Fails

1. Check if GitLab CI environment variables are correctly set.
2. Check if the Firebase CLI token is valid (regenerate if expired).
3. Check the pipeline logs for specific error messages.

### If Build Succeeds but Deployment Fails

1. Check Firebase project settings.
2. Check if the correct project ID is set in `.firebaserc` file.
3. Check if Firebase Functions environment variables are correctly set.

## About Firebase Functions v2 Environment Variables

In Firebase Functions v2, the method for setting environment variables has changed. Previous versions used `firebase functions:config:set` command and `functions.config()`, but v2 uses `.env` files.

### How to Set Environment Variables

1. **Local Development Environment**:
   - Create `.env` file in Functions directory
   - Set required environment variables in `KEY=VALUE` format

2. **CI/CD Environment**:
   - Dynamically generate `.env` file using GitLab CI environment variables
   - `.env` file is automatically loaded during deployment

3. **Production Environment**:
   - Deploying to Firebase Functions sets the contents of `.env` file as environment variables

### How to Access Environment Variables

In Firebase Functions v2, access environment variables using `process.env`:

```javascript
// Previous version (v1)
const config = functions.config();
const tenantId = config.azure.tenant_id;

// New version (v2)
const tenantId = process.env.AZURE_TENANT_ID;
```

## Reference Links

- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [GitLab CI/CD Variables](https://docs.gitlab.com/ee/ci/variables/)
- [Firebase Hosting + Functions Deployment Guide](https://firebase.google.com/docs/hosting/deploying)
- [Firebase Functions v2 Environment Configuration Guide](https://firebase.google.com/docs/functions/config-env?gen=2nd)
