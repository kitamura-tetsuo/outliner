# Outliner

Outliner is a real-time collaborative application built on Yjs.

## Yjs migration

See [docs/fluid_to_yjs.md](docs/fluid_to_yjs.md) for the mapping between legacy data structures and Yjs and current migration status.

## Project Sharing

For information on how to share projects with other users, please refer to [docs/project-sharing.md](docs/project-sharing.md).

## AI Integration Features

### Automatic PR-Issue Linking Feature

This repository includes an automatic PR-Issue linking feature using Gemini CLI and GitHub MCP server integration. When a PR is created, the system automatically analyzes the PR content and links it to relevant open issues.

### Claude Code Action Integration

Claude Code Action is automatically executed when an Issue is created, providing AI-based analysis and support:

- **Trigger**: When creating/editing an Issue, or commenting with `@claude`
- **Execution Environment**: Self-hosted runner
- **AI Model**: Gemini 2.5 Pro (via actual Gemini CLI, MCP supported)
- **Features**: Issue analysis, code suggestions, Q&A

### Automatic PR Test Fix Feature

If PR tests fail, Claude Code Action automatically attempts to fix them:

- **Trigger**: When PR tests fail
- **Execution Environment**: Self-hosted runner
- **AI Model**: Gemini 2.5 Pro (via actual Gemini CLI, MCP supported)
- **Features**: Test failure analysis, code fixes, repeated execution until tests pass (max 5 attempts)

For detailed setup instructions, please refer to [docs/github-actions-setup.md](docs/github-actions-setup.md).

### Improved Workflow

The workflow has been improved to a two-stage approach:

1. **Issue Search Stage**: Gemini CLI analyzes relevant issues and outputs in JSON format
2. **PR Update Stage**: GitHub CLI reliably updates the PR description

This improvement achieves a more reliable automatic linking feature.

### Functional Testing

This PR is intended for testing the automatic linking feature. The system is expected to perform the following:

- Search and analyze open issues
- Analyze PR title and description content
- Automatically link relevant issues

### Workflow Improvements

Detailed logging and improved error handling have been added to the workflow:

- Detailed check of Gemini CLI authentication
- Confirmation of configuration file existence

### Workflow Verification Testing

This section was added to verify the operation of the automatic PR-issue linking workflow.

- Saving and outputting execution logs
- More detailed error messages

## Development Environment Setup

1. Install dependencies:

```bash
# Client-side dependencies
cd client
npm install

# Server-side dependencies
cd ../server
npm install

# Firebase Functions dependencies
cd ../functions
npm install

# Python dependencies (for feature-map script)
cd ..
pip install -r scripts/requirements.txt
```

2. Set up environment variables:

```bash
# Client-side
cd client
cp .env.example .env

# Server-side
cd ../server
cp .env.example .env

# Set local IP to `LOCAL_HOST` in .env if accessing via network

# Firebase Functions
cd ../functions
cp .env.example .env
```

### Encryption of .env Files

Development environment variable files are encrypted using [`dotenvx`](https://dotenvx.com/).
Run the following after initial setup to encrypt `.env.development`.

```bash
npx @dotenvx/dotenvx encrypt --env-file server/.env.development
```

This command encrypts `.env.development` and overwrites it with the same filename.

If decryption is needed, use the `decrypt` subcommand.

## Starting Development Servers

### Client Development Server

```bash
cd client
npm run dev

# Or, to expose on the network
npm run dev:host
```

### Auth Server (Development)

```bash
cd server
npm run dev
```

### Firebase Emulators (Development)

```bash
cd firebase
firebase emulators:start
```

## Build and Deploy

### Build Client

```bash
cd client
npm run build
```

### Deploy to Firebase Hosting + Functions

1. Install Firebase CLI:

```bash
npm install -g firebase-tools
```

2. Login to Firebase:

```bash
firebase login
```

3. Select project:

```bash
firebase use your-project-id
```

4. Build client:

```bash
cd client
npm run build
```

6. Deploy:

```bash
firebase deploy
```

## Environment Variables

### Development Environment

- Client: `VITE_PORT=7070`
- API: `PORT=7071`

### Test Environment

- Client: `VITE_PORT=7080`
- Firebase Emulator host: `VITE_FIREBASE_EMULATOR_HOST=localhost`

## Firebase Hosting + Functions

When using Firebase Hosting + Functions, the following configuration is required:

1. Update client-side environment variables:

```bash
cd client
cp .env.firebase.example .env
```

2. Deploy:

```bash
firebase deploy
```

## Open Source Libraries Used

This project adopts the following major open source libraries.

- **SvelteKit** / **Svelte** - Used for client UI development.
- **Express** - Builds the authentication server.
- **Firebase** - Used for authentication and hosting.

Each library is released under licenses such as MIT or Apache, and details are listed in `package.json`.

## SSO Login Procedure (For New Employees)

1. After obtaining a company SSO account, please contact the internal administrator with your GitHub username.
2. Once access rights to the repository are granted, access `/login` in your browser to complete SSO login.
3. You will be automatically registered with Firebase Authentication after the first login.

## How to Run Tests

Unit tests use `Vitest`, and E2E tests use `Playwright`.

We recommend using `scripts/test.sh` to run tests. This script automatically calls `scripts/setup.sh` to set up the emulator environment if necessary.

```bash
# Run specific tests (Auto-detect Unit/Integration/E2E)
scripts/test.sh client/e2e/path/to/test.spec.ts

# E2E Tests (Specify directory)
scripts/test.sh client/e2e

# Run all tests
scripts/test.sh
```

When using `scripts/test.sh`, manual execution of `scripts/setup.sh` beforehand is not required (it is done automatically).
If executing by other methods, run `scripts/setup.sh` beforehand to start the local emulators.

### Running Playwright Tests Sequentially

In cloud environments, running multiple E2E tests at once may cause timeouts. Use `scripts/run-e2e-progress.sh 1` to run test files one by one.
This prevents timeout errors during coding agent's env runs.

```bash
scripts/run-e2e-progress.sh 1
```

This script records progress in the `.e2e-progress` file and can resume from where it left off even if a timeout occurs. Please log any timed-out tests.
Delete `.e2e-progress` to start from the beginning.

### Starting Local Servers Together

When performing manual tests locally, execute `scripts/setup.sh`. SvelteKit, Yjs WebSocket, and Firebase Emulators will start, and subsequent tests can be executed.

## Aggregating Feature Documentation

`docs/client-features.yaml` and `docs/dev-features.yaml` are generated by aggregating YAMLs under `docs/client-features/` and `docs/dev-features/`. Run the following command after adding a new YAML file.

```bash
python scripts/aggregate_features.py
```

### Verifying Format with pre-push

Run `dprint check` before push to check for unformatted files. Set up the hook as follows:

```bash
ln -s ../../scripts/pre_push.sh .git/hooks/pre-push
```

If there are unformatted files, the push will be rejected.
