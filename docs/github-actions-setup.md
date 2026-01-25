# GitHub Actions Setup for Claude Code Integration (Archived)

**📌 Important**: This document has been archived. The Gemini CI workflow has been disabled, and self-hosted runners are currently not in use.

**Current Status**:

- ✅ Migrated to GitHub-hosted runners
- ✅ Gemini CI workflow disabled (saved as `.disabled` file)
- ✅ All CI/CD features continue to operate on GitHub-hosted runners

**New Document**:

- English version: `docs/github-actions-setup-en.md`
- Japanese version (current archive info): `docs/gemini-cli-setup.md`

---

**Previous Information**: This document described the procedure to set up Gemini CLI to work using `claude-code-router` when a Claude Code Action is executed on a self-hosted runner during issue creation.

## Overview

### Issue Analysis Feature

- **Workflow**: `.github/workflows/issue-claude-action.yml`
- **Trigger**: Upon Issue creation/edit, or comment creation containing `@claude`
- **Execution Environment**: Self-hosted runner
- **AI Model**: Gemini 2.5 Pro (via Gemini CLI)
- **Routing**: Uses Claude Code Router

### PR Automated Test Fix Feature

- **Workflow**: `.github/workflows/pr-test-fix.yml`
- **Trigger**: When a PR test fails
- **Execution Environment**: Self-hosted runner
- **AI Model**: Gemini 2.5 Pro (via Gemini CLI)
- **Feature**: Automatically analyzes and fixes test failures, repeating until tests pass

## Prerequisites

### 1. Self-hosted Runner Setup

You need to add a self-hosted runner to your GitHub repository:

1. Go to Repository Settings > Actions > Runners
2. Click "New self-hosted runner"
3. Follow the instructions to configure the runner

### 2. Runner Environment Preparation

Prepare the following environment on the self-hosted runner:

```bash
# Install Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install required global packages
npm install -g @google/gemini-cli
npm install -g @musistudio/claude-code-router

# Git configuration (for GitHub Actions)
git config --global user.email "github-actions[bot]@users.noreply.github.com"
git config --global user.name "GitHub Actions Bot"
```

### 3. Gemini CLI Authentication Setup

#### Method 1: OAuth Authentication (Recommended)

Run the following on the runner:

```bash
gemini auth login
```

A browser will open; login with your Google account and complete the authentication.
Authentication credentials will be saved in `~/.gemini/oauth_creds.json`.

#### Method 2: API Key Authentication

1. Get an API Key at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Go to GitHub repository Settings > Secrets and variables > Actions
3. Add the API Key with the name `GEMINI_API_KEY`

## Workflow Behavior

### Issue Analysis Workflow

#### Trigger Conditions

The workflow is executed when:

- An Issue is created or edited
- An Issue comment is created and contains `@claude`

### PR Automated Test Fix Workflow

#### Trigger Conditions

The workflow is executed when:

- A PR test workflow completes with failure
- The target PR is open

### Execution Steps

1. **Environment Prep**: Node.js, Git settings
2. **Claude Code Router Setup**: Create config file, retrieve transformer
3. **Gemini CLI Auth Check**: Verify OAuth or API Key authentication
4. **Start Router**: Start Claude Code Router in the background
5. **Run Claude Code Action**: Analyze Issue and generate response
6. **Cleanup**: Terminate Router process

### Configuration File

The workflow starts Claude Code Router with the following settings:

**Important Settings:**

- **Custom Transformer**: Uses a custom transformer to invoke the actual Gemini CLI command
- `forceModel: true`: Passes `--force-model` option to Gemini CLI to enforce model usage
- `"forceModel": "gemini-2.5-pro"`: Enforces specific model at the Router level
- **MCP Support**: Supports advanced features like MCP by using the actual Gemini CLI

```json
{
    "LOG": true,
    "API_TIMEOUT_MS": 600000,
    "transformers": [
        {
            "path": "$HOME/.claude-code-router/plugins/gemini-cli-direct.js",
            "options": {
                "project": "outliner-d57b0",
                "forceModel": true
            }
        }
    ],
    "Providers": [
        {
            "name": "gemini-cli-direct",
            "api_base_url": "http://localhost:3456",
            "api_key": "dummy-key",
            "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
            "transformer": {
                "use": ["gemini-cli-direct"]
            }
        }
    ],
    "Router": {
        "default": "gemini-cli-direct,gemini-2.5-pro",
        "think": "gemini-cli-direct,gemini-2.5-pro",
        "longContext": "gemini-cli-direct,gemini-2.5-pro",
        "longContextThreshold": 60000,
        "forceModel": "gemini-2.5-pro"
    }
}
```

### Custom Gemini CLI Transformer

This project uses a custom transformer that calls the actual Gemini CLI command:

**Features:**

- **Actual Gemini CLI Execution**: Executes `gemini` command instead of Google Cloud Code API
- **MCP Support**: Supports full capabilities of Gemini CLI (MCP etc.)
- **Force-Model Support**: Enforces model usage with `--force-model` option
- **JSON Output**: Retrieves structured output with `--format json`
- **Temp File Management**: Manages conversation data in temporary files and automatically deletes them after execution

**Execution Example:**

```bash
gemini --model gemini-2.5-pro --force-model --project outliner-d57b0 --format json --file /tmp/conversation.json
```

## Troubleshooting

### Authentication Error

```
❌ No Gemini CLI credentials found
```

**Solution**:

1. Run `gemini auth login` on the Runner
2. Or set the `GEMINI_API_KEY` secret

### Router Start Error

```
❌ Claude Code Router failed to start within 30 seconds
```

**Solution**:

1. Manually run `ccr start` on the Runner to check for errors
2. Check if port 3456 is available
3. Check the log file `~/.claude-code-router.log`

### Network Error

**Solution**:

1. Check if access to Google API is possible from the Runner environment
2. Add proxy settings to the configuration file if necessary

## Security Considerations

- Execute self-hosted runners in a trusted environment
- Manage API Keys appropriately as secrets
- Protect OAuth credentials with appropriate file permissions
- Ensure log files do not contain sensitive information

## Usage

1. Claude Code Action runs automatically when a new Issue is created
2. Analysis runs when a comment containing `@claude` is added to an existing Issue
3. Analysis results are added as Issue comments

## Limitations

- Works only on self-hosted runners
- Requires Gemini CLI authentication
- Requires internet connection
- Concurrent execution is limited to one per Issue
