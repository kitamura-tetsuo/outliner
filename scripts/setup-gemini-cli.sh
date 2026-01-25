#!/bin/bash

# Gemini CLI Setup Script for Self-Hosted GitHub Actions Runner
# This script sets up Gemini CLI authentication on a self-hosted runner

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Check if running as root and determine target user
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root user"

    # Check if runner user exists
    if id "runner" >/dev/null 2>&1; then
        print_info "Runner user found. Configuring for runner user"
        TARGET_USER="runner"
        TARGET_HOME="/home/runner"
    else
        print_error "Runner user not found"
        print_info "Please check the execution user of GitHub Actions runner"
        print_info "Available users:"
        cut -d: -f1 /etc/passwd | grep -v "^root$" | head -10
        exit 1
    fi
else
    TARGET_USER="$USER"
    TARGET_HOME="$HOME"
fi

print_info "Target user: $TARGET_USER"
print_info "Target home directory: $TARGET_HOME"

print_header "Gemini CLI Setup for Self-Hosted Runner"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    print_error "Node.js not found"
    print_info "Please install Node.js and try again"
    exit 1
fi

print_info "Node.js version: $(node --version)"
print_info "NPM version: $(npm --version)"

# Check if npm is available
if ! command -v npm >/dev/null 2>&1; then
    print_error "npm not found"
    exit 1
fi

# Install Gemini CLI if not available
if ! command -v gemini >/dev/null 2>&1; then
    print_info "Installing Gemini CLI..."
    if npm install -g @google/generative-ai-cli; then
        print_success "Gemini CLI installation completed"
    else
        print_error "Failed to install Gemini CLI"
        print_info "Please install manually: npm install -g @google/generative-ai-cli"
        exit 1
    fi
else
    print_success "Gemini CLI is already installed"
    print_info "Version: $(gemini --version 2>/dev/null || echo 'version check failed')"
fi

# Function to run command as target user
run_as_target_user() {
    if [ "$TARGET_USER" = "$USER" ]; then
        # Same user, run directly
        eval "$1"
    else
        # Different user, use su
        su - "$TARGET_USER" -c "$1"
    fi
}

# Check if authentication already exists
OAUTH_FILE="$TARGET_HOME/.gemini/oauth_creds.json"
if [ -f "$OAUTH_FILE" ]; then
    print_success "Existing credentials found: $OAUTH_FILE"

    # Check file permissions
    PERMS=$(stat -c "%a" "$OAUTH_FILE" 2>/dev/null || stat -f "%A" "$OAUTH_FILE" 2>/dev/null || echo "unknown")
    if [ "$PERMS" = "600" ]; then
        print_success "File permissions are correct (600)"
    else
        print_warning "Fixing file permissions..."
        chmod 600 "$OAUTH_FILE"
        chown "$TARGET_USER:$TARGET_USER" "$OAUTH_FILE" 2>/dev/null || true
        print_success "Set file permissions to 600"
    fi

    # Test authentication
    print_info "Testing authentication..."
    if run_as_target_user "timeout 10 gemini models list >/dev/null 2>&1"; then
        print_success "Authentication test passed!"
        print_success "Gemini CLI is ready to use"
        exit 0
    else
        print_warning "Authentication test failed. Re-authentication required"
    fi
fi

# Check if API key is already set
if [ -n "$GEMINI_API_KEY" ] || [ -n "$GOOGLE_API_KEY" ]; then
    print_success "API Key is set"
    print_info "Testing authentication..."
    if run_as_target_user "timeout 10 gemini --version >/dev/null 2>&1"; then
        print_success "Gemini CLI is ready to use"
        exit 0
    else
        print_warning "Authentication test with API Key failed"
    fi
fi

# Perform OAuth authentication via browser (prioritized)
print_header "Executing OAuth Authentication"
print_info "Running Gemini CLI to authenticate via browser"
print_info "Please login with your Google account when the browser opens"
print_warning "Note: This operation requires browser access"

# Create .gemini directory if it doesn't exist
run_as_target_user "mkdir -p '$TARGET_HOME/.gemini'"

# Check if we're in a CI environment and warn but continue
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
    print_warning "CI environment detected"
    print_info "Browser authentication may not work in CI environment"
    print_info "If authentication fails, please use the following methods:"
    print_info ""
    print_info "Method 1: Use API Key (Recommended)"
    print_info "  1. Generate API Key at Google AI Studio (https://aistudio.google.com/apikey)"
    print_info "  2. Register as GEMINI_API_KEY in GitHub Secrets"
    print_info ""
    print_info "Method 2: Transfer OAuth Credentials"
    print_info "  1. Run 'gemini' on local machine to authenticate"
    print_info "  2. Run scripts/generate-gemini-secret.sh to generate Base64 value"
    print_info "  3. Register as GEMINI_OAUTH_B64 in GitHub Secrets"
    print_info ""
    print_info "See docs/gemini-cli-setup.md for details"
    print_info ""
    print_info "Attempting browser authentication..."
fi

# Run gemini CLI to trigger browser authentication
print_info "Running Gemini CLI..."
print_info "When the authentication screen appears, follow instructions to login with Google account"
print_info "After authentication completes, type 'exit' in CLI to finish"

if run_as_target_user "gemini"; then
    print_success "Gemini CLI exited successfully"
else
    print_info "Gemini CLI exited (authentication may be complete)"
fi

# Check if authentication file was created
if [ -f "$OAUTH_FILE" ]; then
    chmod 600 "$OAUTH_FILE"
    chown "$TARGET_USER:$TARGET_USER" "$OAUTH_FILE" 2>/dev/null || true
    print_success "Authentication file created: $OAUTH_FILE"
    print_success "Set authentication file permissions"

    # Test authentication
    print_info "Testing authentication..."
    if run_as_target_user "timeout 10 gemini --version >/dev/null 2>&1"; then
        print_success "Authentication test passed!"
        print_success "Gemini CLI setup completed"
    else
        print_warning "Timeout occurred during authentication test, but authentication file was created"
        print_info "Please check manually: gemini --version"
    fi
else
    print_warning "OAuth authentication file not found"
    print_info "Authentication may not have completed"
    print_info ""
    print_info "Please try the following methods:"
    print_info ""
    print_info "Method 1: Run browser authentication again"
    print_info "  Run this script again"
    print_info ""
    print_info "Method 2: Use API Key"
    print_info "  1. Generate API Key at https://aistudio.google.com/apikey"
    print_info "  2. Set environment variable: export GEMINI_API_KEY='your-api-key'"
    print_info ""
    print_info "Method 3: Run Gemini CLI manually"
    print_info "  Run gemini command directly to complete authentication"

    if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
        print_info ""
        print_info "In CI environment, using GitHub Secrets is recommended"
        print_info "See docs/gemini-cli-setup.md for details"
    fi

    exit 1
fi

print_header "GitHub MCP Server Configuration"
print_info "Configuring GitHub MCP Server..."

# Create GitHub MCP server configuration
SETTINGS_FILE="$TARGET_HOME/.gemini/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    print_info "Existing settings.json found"
    # Backup existing settings
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    print_info "Backed up existing settings"
else
    print_info "Creating new settings.json"
    run_as_target_user "mkdir -p '$TARGET_HOME/.gemini'"
fi

# Create settings.json with GitHub MCP server and optional Playwright MCP (localhost)
cat > "$SETTINGS_FILE" << 'EOF'
{
  "theme": "Default Dark",
  "selectedAuthType": "oauth-personal",
  "checkpointing": {"enabled": true},
  "mcpServers": {
    "github": {
      "httpUrl": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "${GEMINI_GITHUB_PAT}"
      },
      "timeout": 10000
    },
    "playwright": {
      "transport": "sse",
      "url": "http://localhost:4312",
      "requiresAuth": false,
      "timeout": 15000
    }
  }
}
EOF

# Set proper ownership
chown "$TARGET_USER:$TARGET_USER" "$SETTINGS_FILE" 2>/dev/null || true
chmod 600 "$SETTINGS_FILE"

print_success "GitHub MCP Server configuration completed"
print_info "Configuration file: $SETTINGS_FILE"

print_header "Setup Completed"
print_success "Gemini CLI is now ready to use in GitHub Actions"
print_info "Credentials location: $OAUTH_FILE"
print_info "Target user: $TARGET_USER"
print_info "Usage limits: 60 RPM / 1,000 RPD (OAuth Free Tier)"

# Display next steps
print_header "Next Steps"
echo "1. Create GitHub Personal Access Token (PAT)"
echo "   - GitHub > Settings > Developer settings > Personal access tokens"
echo "   - Required permissions: repo, issues, pull_requests"
echo "2. Register as GEMINI_GITHUB_PAT in GitHub Secrets"
echo "3. Run GitHub Actions workflow to verify operation"
echo "4. Perform similar setup on other runners if needed"

print_info "For detailed information, see docs/gemini-cli-setup.md"
